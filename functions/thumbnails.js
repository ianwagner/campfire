import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import sharp from 'sharp';
import admin from 'firebase-admin';

// Generates thumbnails for Drive files and supports shared drives via
// supportsAllDrives on download calls.
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: 'tak-campfire-main'
  });
  
}

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
  console.log('📦 Accessing default storage bucket');
  let bucket;
  try {
    bucket = admin.storage().bucket();
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
      const dl = await drive.files.get({
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      }, { responseType: 'arraybuffer' });
      await fs.writeFile(tmp, Buffer.from(dl.data));
      let inputTmp = tmp;
      const meta = await sharp(tmp).metadata().catch(() => ({}));
      if (meta.format === 'tiff') {
        const pngTmp = path.join(os.tmpdir(), `${fileId}.png`);
        await sharp(tmp).toFormat('png').toFile(pngTmp);
        await fs.unlink(tmp).catch(() => {});
        inputTmp = pngTmp;
      }
      const thumbTmp = path.join(os.tmpdir(), `${fileId}.webp`);
      await sharp(inputTmp).resize({ width: 300 }).toFormat('webp').toFile(thumbTmp);
      const dest = `thumbnails/${name}.webp`;
      await bucket.upload(thumbTmp, { destination: dest, contentType: 'image/webp', resumable: false });
      await bucket.file(dest).makePublic();
      result.thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${dest}`;
      if (inputTmp !== tmp) await fs.unlink(inputTmp).catch(() => {});
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

export const deleteThumbnails = onCallFn({ timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  const urls = request.data?.urls || request.data;
  if (!Array.isArray(urls)) {
    throw new HttpsError('invalid-argument', 'urls array is required');
  }
  const bucket = admin.storage().bucket();
  for (const url of urls) {
    try {
      const match = /thumbnails\/([^/?]+)/.exec(url);
      if (match?.[1]) {
        await bucket.file(`thumbnails/${match[1]}`).delete({ ignoreNotFound: true });
      }
    } catch (err) {
      console.error('Failed to delete thumbnail', url, err);
    }
  }
  return { success: true };
});
