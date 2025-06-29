import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { google } from 'googleapis';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import admin from 'firebase-admin';

async function listImages(folderId, drive) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id,name,webContentLink,mimeType)',
  });
  return res.data.files || [];
}

export const tagger = onCallFn({ secrets: ['OPENAI_API_KEY'], memory: '512MiB', timeoutSeconds: 300 }, async (data, context) => {
  try {
    // When invoked via a plain HTTP request the payload may be wrapped in a
    // `data` field. Support both invocation styles so the function doesn't
    // reject valid requests where the parameters are nested under `data`.
    const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
    const { driveFolderUrl, campaign } = payload || {};
    if (!driveFolderUrl || driveFolderUrl.trim() === '') {
      throw new HttpsError('invalid-argument', 'Missing driveFolderUrl');
    }
    const job = await admin.firestore().collection('taggerJobs').add({
      driveFolderUrl: driveFolderUrl.trim(),
      campaign: campaign || '',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: context.auth?.uid || null,
    });
    return { jobId: job.id };
  } catch (err) {
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('internal', err.message || 'Tagger failed');
  }
});

async function processJob(doc) {
  const data = doc.data();
  const { driveFolderUrl, campaign } = data;
  const match = /\/folders\/([^/?]+)/.exec(driveFolderUrl);
  if (!match) {
    await doc.ref.update({ status: 'error', error: 'Invalid driveFolderUrl' });
    return null;
  }
  const folderId = match[1];

  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });
  const visionClient = new vision.ImageAnnotatorClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const files = await listImages(folderId, drive);
  const results = [];

  const BATCH_SIZE = 5;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
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
          const parsed = JSON.parse(text);
          description = parsed.description || description;
          type = parsed.type || '';
          product = parsed.product || '';
        } catch (err) {
          console.error('OpenAI failed:', err?.message || err?.toString());
        }
        results.push({
          name: file.name,
          url: file.webContentLink,
          type,
          description,
          product,
          campaign,
        });
      } catch (err) {
        console.error(`Failed to process file ${file.name}:`, err?.message || err?.toString());
      }
    }
  }

  await doc.ref.update({
    status: 'complete',
    total: files.length,
    processed: results.length,
    results,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return null;
}

export const processTaggerJob = onDocumentCreated('taggerJobs/{id}', async (event) => {
  try {
    return await processJob(event.data);
  } catch (err) {
    await event.data.ref.update({ status: 'error', error: err.message || String(err) });
    return null;
  }
});
