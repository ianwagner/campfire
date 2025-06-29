import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { google } from 'googleapis';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

async function listImages(folderId, drive) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id,name,webContentLink,mimeType)',
  });
  return res.data.files || [];
}

async function createThumbnail(srcPath) {
  const tempPath = path.join(os.tmpdir(), `${path.basename(srcPath)}_thumb.webp`);
  await sharp(srcPath)
    .resize({ width: 300 })
    .toFormat('webp')
    .toFile(tempPath);
  const base64 = await fs.readFile(tempPath, 'base64');
  return { path: tempPath, dataUrl: `data:image/webp;base64,${base64}` };
}

export const tagger = onCallFn({ secrets: ['OPENAI_API_KEY'] }, async (data) => {
  try {
    const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
    const { driveFolderUrl, campaign } = payload || {};
    if (!driveFolderUrl || driveFolderUrl.trim() === '') {
      throw new HttpsError('invalid-argument', 'Missing driveFolderUrl');
    }
    const match = /\/folders\/([^/?]+)/.exec(driveFolderUrl);
    if (!match) {
      throw new HttpsError('invalid-argument', 'Invalid driveFolderUrl');
    }
    const doc = await admin.firestore().collection('taggerJobs').add({
      driveFolderUrl,
      campaign,
      status: 'pending',
      processed: 0,
      total: 0,
      createdAt: Date.now(),
    });
    return { jobId: doc.id };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'Tagger failed');
  }
});

export const processTaggerJob = onDocumentCreated('taggerJobs/{id}', { secrets: ['OPENAI_API_KEY'], memory: '512MiB', timeoutSeconds: 540 }, async (event) => {
  const snap = event.data;
  if (!snap) return null;
  const data = snap.data() || {};
  const jobRef = snap.ref;

  if (data.status !== 'pending') return null;

  const { driveFolderUrl, campaign } = data;
  const match = /\/folders\/([^/?]+)/.exec(driveFolderUrl || '');
  if (!match) {
    await jobRef.update({ status: 'error', error: 'Invalid driveFolderUrl', completedAt: Date.now() });
    return null;
  }
  const folderId = match[1];

  try {
    await jobRef.update({ status: 'processing' });

    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
    const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
    const visionClient = new vision.ImageAnnotatorClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const files = await listImages(folderId, drive);
    await jobRef.update({ total: files.length });

    let processed = 0;
    for (const file of files) {
      try {
        const dest = path.join(os.tmpdir(), file.id);
        const dl = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
        await fs.writeFile(dest, Buffer.from(dl.data));

        const { path: thumbPath, dataUrl: thumbDataUrl } = await createThumbnail(dest);
        await fs.unlink(dest).catch(() => {});

        const [visionRes] = await visionClient.labelDetection({ image: { content: await fs.readFile(thumbPath) } });
        await fs.unlink(thumbPath).catch(() => {});
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
          if (!jsonMatch) throw new Error('OpenAI did not return valid JSON');
          const parsed = JSON.parse(jsonMatch[0]);
          description = parsed.description || description;
          type = parsed.type || '';
          product = parsed.product || '';
        } catch (err) {
          console.error('OpenAI failed:', err?.message || err?.toString());
        }

        const result = {
          name: file.name,
          url: file.webContentLink,
          thumbnail: thumbDataUrl,
          type,
          description,
          product,
          campaign,
        };

        processed += 1;
        await jobRef.update({
          processed,
          results: admin.firestore.FieldValue.arrayUnion(result),
        });
      } catch (err) {
        console.error(`Failed to process file ${file.name}:`, err?.message || err?.toString());
      }
    }

    await jobRef.update({
      status: 'complete',
      processed,
      completedAt: Date.now(),
    });
  } catch (err) {
    console.error('Tagger job failed:', err?.message || err?.toString());
    await jobRef.update({
      status: 'error',
      error: err.message || err.toString(),
      completedAt: Date.now(),
    });
  }
  return null;
});
