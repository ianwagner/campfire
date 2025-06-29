import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
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

export const tagger = onCallFn({ secrets: ['OPENAI_API_KEY'], memory: '512MiB', timeoutSeconds: 300 }, async (data, context) => {
  let jobRef;
  try {
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

    jobRef = await admin.firestore().collection('taggerJobs').add({
      driveFolderUrl,
      campaign,
      total: files.length,
      processed: 0,
      status: 'processing',
      createdAt: Date.now(),
    });

    for (const file of files) {
      try {
        const dest = path.join(os.tmpdir(), file.id);
        const dl = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        await fs.writeFile(dest, Buffer.from(dl.data));

        const { path: thumbPath, dataUrl: thumbDataUrl } = await createThumbnail(dest);
        const visionBuf = await sharp(dest).resize({ width: 512 }).toBuffer();
        await fs.unlink(dest).catch(() => {});
        const [visionRes] = await visionClient.labelDetection({
          image: { content: visionBuf },
        });
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
          const jsonMatch = text.match(/\{[\s\S]*?\}/); // match first JSON block
          if (!jsonMatch) throw new Error('OpenAI did not return valid JSON');
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
          thumbnail: thumbDataUrl,
          type,
          description,
          product,
          campaign,
        });
      } catch (err) {
        console.error(`Failed to process file ${file.name}:`, err?.message || err?.toString());
      }
    }

    await jobRef.set({
      status: 'complete',
      processed: results.length,
      results,
      completedAt: Date.now(),
    }, { merge: true });

    console.log('✅ Tagger function complete. Returning results.');

    return {
      jobId: jobRef.id,
      total: files.length,
      processed: results.length,
      results,
    };
  } catch (err) {
    console.error('Tagger failed:', err?.message || err?.toString());
    if (jobRef) {
      await jobRef.set({
        status: 'error',
        error: err.message || err.toString(),
        completedAt: Date.now(),
      }, { merge: true });
    }
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('internal', err.message || 'Tagger failed');
  }
});
