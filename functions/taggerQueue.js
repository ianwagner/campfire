// Tagger job creation and processing workers
import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { google } from 'googleapis';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import admin from 'firebase-admin';

async function listImages(folderId, drive) {
  const files = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: 'nextPageToken, files(id,name,webContentLink)',
      pageToken,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return files;
}

function extractFolderId(url) {
  const match = /\/folders\/([^/?]+)/.exec(url || '');
  return match ? match[1] : null;
}

function validatePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object');
  }
  const { driveFolderUrl, campaign = '', priority = 'high' } = data;
  if (typeof driveFolderUrl !== 'string' || driveFolderUrl.trim() === '') {
    throw new HttpsError('invalid-argument', 'Missing driveFolderUrl');
  }
  const folderId = extractFolderId(driveFolderUrl);
  if (!folderId) {
    throw new HttpsError('invalid-argument', 'Invalid driveFolderUrl');
  }
  return { driveFolderUrl: driveFolderUrl.trim(), campaign, priority };
}

export const createTaggerJob = onCallFn({ timeoutSeconds: 30 }, async (request) => {
  const payload = request.data && typeof request.data === 'object' && 'data' in request.data ? request.data.data : request.data;
  console.log('📩 Received createTaggerJob payload:', payload);

  if (!request.auth) {
    console.warn('🛑 Unauthenticated call to createTaggerJob');
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const { driveFolderUrl, campaign, priority } = validatePayload(payload);

  const jobRef = await admin.firestore().collection('taggerJobs').add({
    driveFolderUrl,
    campaign,
    priority: priority === 'low' ? 'low' : 'high',
    uid: request.auth.uid,
    createdBy: request.auth.uid,
    status: 'pending',
    processed: 0,
    total: 0,
    lastProcessedIndex: 0,
    errors: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('📝 Created tagger job:', jobRef.id);

  return { jobId: jobRef.id };
});

async function processJobBatch(jobSnap) {
  const data = jobSnap.data();
  if (!data) return;
  const jobRef = jobSnap.ref;
  const folderId = extractFolderId(data.driveFolderUrl);
  if (!folderId) {
    await jobRef.set({ status: 'error', errors: ['Invalid folder URL'], updatedAt: Date.now() }, { merge: true });
    return;
  }
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  const visionClient = new vision.ImageAnnotatorClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const files = await listImages(folderId, drive);
  const total = files.length;
  const start = data.lastProcessedIndex || 0;
  const BATCH_SIZE = 5;
  const batch = files.slice(start, start + BATCH_SIZE);
  let processed = data.processed || 0;
  const errors = Array.isArray(data.errors) ? data.errors : [];

  for (const file of batch) {
    try {
      const dest = path.join(os.tmpdir(), file.id);
      const dl = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      await fs.writeFile(dest, Buffer.from(dl.data));
      const [visionRes] = await visionClient.labelDetection(dest);
      await fs.unlink(dest).catch(() => {});
      const labels = (visionRes.labelAnnotations || []).map(l => l.description).join(', ');
      let description = labels;
      let type = '';
      let product = '';
      try {
        const prompt = `These labels describe an asset: ${labels}. Provide a short description, asset type, and product in JSON {description, type, product}.`;
        const gpt = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        });
        const text = gpt.choices?.[0]?.message?.content || '';
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          description = parsed.description || description;
          type = parsed.type || '';
          product = parsed.product || '';
        }
      } catch (err) {
        errors.push(`OpenAI failed for ${file.name}: ${err.message}`);
      }
      await jobRef.collection('results').add({ name: file.name, url: file.webContentLink, type, description, product, campaign: data.campaign });
      processed += 1;
    } catch (err) {
      errors.push(`Failed ${file.name}: ${err.message}`);
    }
  }

  const finished = processed >= total;
  await jobRef.set({
    total,
    processed,
    lastProcessedIndex: start + batch.length,
    status: finished ? 'complete' : 'in_progress',
    errors,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export const onTaggerJobCreated = onDocumentCreated('taggerJobs/{id}', async (event) => {
  const data = event.data.data();
  if (data.priority === 'high') {
    await processJobBatch(event.data);
  }
  return null;
});

export const onTaggerJobUpdated = onDocumentUpdated('taggerJobs/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return null;
  if (after.priority === 'high' && ['pending', 'paused'].includes(after.status) && before.status !== after.status) {
    await processJobBatch(event.data.after);
  }
  return null;
});

export const runLowPriorityJobs = onSchedule('every 5 minutes', async () => {
  const snap = await admin.firestore().collection('taggerJobs')
    .where('priority', '==', 'low')
    .where('status', 'in', ['pending', 'in_progress', 'paused'])
    .orderBy('createdAt')
    .limit(1)
    .get();
  const docs = snap.docs;
  for (const doc of docs) {
    await processJobBatch(doc);
  }
});
