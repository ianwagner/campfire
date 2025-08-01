import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import sharp from 'sharp';

// Uses Google Drive API with supportsAllDrives so folders from shared drives
// can be processed the same as My Drive folders.
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

async function listImages(folderId, drive) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id,name,webContentLink,mimeType)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  return res.data.files || [];
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
    let processedCount = 0;

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
        const dl = await drive.files.get({
          fileId: file.id,
          alt: 'media',
          supportsAllDrives: true,
        }, { responseType: 'arraybuffer' });
        let buffer = Buffer.from(dl.data);
        if (buffer.length > 2 * 1024 * 1024) {
          try {
            buffer = await sharp(buffer)
              .resize({ width: 1024, withoutEnlargement: true })
              .jpeg({ quality: 70 })
              .toBuffer();
          } catch (err) {
            console.error('Image compression failed, using original buffer', err?.message || err?.toString());
          }
        }
        const [visionRes] = await visionClient.labelDetection({ image: { content: buffer } });
        buffer = null;
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
        const result = {
          name: file.name,
          url: file.webContentLink,
          type,
          description,
          product,
          campaign,
        };
        await jobRef.set({
          processed: admin.firestore.FieldValue.increment(1),
          results: admin.firestore.FieldValue.arrayUnion(result),
        }, { merge: true });
        processedCount += 1;
      } catch (err) {
        console.error(`Failed to process file ${file.name}:`, err?.message || err?.toString());
      }
    }

    await jobRef.set({
      status: 'complete',
      processed: processedCount,
      completedAt: Date.now(),
    }, { merge: true });

    console.log('✅ Tagger function complete.');

    return {
      jobId: jobRef.id,
      total: files.length,
      processed: processedCount,
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
