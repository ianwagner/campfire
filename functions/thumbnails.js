import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import sharp from 'sharp';
import admin from 'firebase-admin';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

if (!admin.apps.length) {
  admin.initializeApp();
}

const DEFAULT_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'tak-campfire-main';

function extractFileId(url) {
  if (!url) return null;
  // Matches ID in various drive url formats
  const match = url.match(/[\w-]{25,}/);
  return match ? match[0] : null;
}

export const generateThumbnailsForAssets = onCallFn({ timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  const assets = request.data?.assets || request.data;
  if (!Array.isArray(assets)) {
    throw new HttpsError('invalid-argument', 'assets array is required');
  }

  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  console.log(`📦 Accessing storage bucket: ${DEFAULT_BUCKET}`);
  let bucket;
  try {
    bucket = admin.storage().bucket(DEFAULT_BUCKET);
    if (!bucket) throw new Error('bucket() returned undefined');
  } catch (err) {
    console.error('❌ Failed to access bucket', err);
    throw err;
  }
  const results = [];

  for (const asset of assets) {
    const { url, name } = asset || {};
    const result = { url, name };
    try {
      const fileId = extractFileId(url);
      if (!fileId) throw new Error('Invalid Drive URL');
      const tmp = path.join(os.tmpdir(), fileId);
      const dl = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
      await fs.writeFile(tmp, Buffer.from(dl.data));
      const thumbTmp = path.join(os.tmpdir(), `${fileId}.webp`);
      await sharp(tmp).resize({ width: 300 }).toFormat('webp').toFile(thumbTmp);
      const dest = `thumbnails/${name}.webp`;
      await bucket.upload(thumbTmp, { destination: dest, contentType: 'image/webp', resumable: false });
      await bucket.file(dest).makePublic();
      result.thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${dest}`;
      await fs.unlink(tmp).catch(() => {});
      await fs.unlink(thumbTmp).catch(() => {});
    } catch (err) {
      console.error('Failed processing', name, err);
      result.error = err.message || 'error';
    }
    results.push(result);
  }
  return { results };
});
