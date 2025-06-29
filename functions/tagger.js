import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
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

export const tagger = onCallFn({ secrets: ['OPENAI_API_KEY'], memory: '512MiB', timeoutSeconds: 300, }, async (data, context) => {

  try {
    // When invoked via a plain HTTP request the payload may be wrapped in a
    // `data` field. Support both invocation styles so the function doesn't
    // reject valid requests where the parameters are nested under `data`.
  console.log('Raw data received in tagger');
    const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
    console.log('Parsed payload:', payload);
    const { driveFolderUrl, campaign } = payload || {};
    console.log('Tagger called with data:', { driveFolderUrl, campaign });
    if (!driveFolderUrl || driveFolderUrl.trim() === '') {
      throw new HttpsError('invalid-argument', 'Missing driveFolderUrl');
    }
    const match = /\/folders\/([^/?]+)/.exec(driveFolderUrl);
    if (!match) {
      throw new HttpsError('invalid-argument', 'Invalid driveFolderUrl');
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
  console.log(`Processing batch ${i / BATCH_SIZE + 1}: ${batch.length} files`);

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
const jsonMatch = text.match(/\{[\s\S]*?\}/); // match first JSON block

if (!jsonMatch) throw new Error("OpenAI did not return valid JSON");

const parsed = JSON.parse(jsonMatch[0]);
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

const job = await admin.firestore().collection('taggerJobs').add({
  driveFolderUrl,
  campaign,
  total: files.length,
  processed: results.length,
  createdAt: Date.now(),
});

    return {
  jobId: job.id,
  total: files.length,
  processed: results.length,
  results,
};
  } catch (err) {
    console.error('Tagger failed:', err?.message || err?.toString());
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('internal', err.message || 'Tagger failed');
  }
});
