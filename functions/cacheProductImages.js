import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import path from 'path';
import sharp from 'sharp';

if (!admin.apps.length) {
  admin.initializeApp();
}

function slugify(str = '') {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const cacheProductImages = onCallFn({ timeoutSeconds: 120, memory: '1GiB' }, async (request) => {
  try {
    const { urls, brandCode, productName } = request.data || {};
    if (!Array.isArray(urls) || !brandCode || !productName) {
      throw new HttpsError('invalid-argument', 'urls, brandCode and productName are required');
    }

    const safeBrand = brandCode.replace(/\//g, '-').trim();
    const slug = slugify(productName);
    const bucket = admin.storage().bucket();
    const uploaded = [];

    for (const u of urls) {
      try {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`Failed to fetch ${u}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        let filename = path.basename(new URL(u).pathname);
        if (!filename) filename = Math.random().toString(36).slice(2);
        const dest = `Campfire/Brands/${safeBrand}/Products/${slug}/Images/${filename}`;
        const file = bucket.file(dest);
        await file.save(buffer, { contentType: res.headers.get('content-type') || undefined });
        await file.makePublic();
        const [url] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });

        let thumbUrl = '';
        try {
          const base = path.basename(filename, path.extname(filename));
          const thumbDest = `Campfire/Brands/${safeBrand}/Products/${slug}/Images/${base}_thumb.webp`;
          const thumbBuf = await sharp(buffer).resize({ width: 300 }).toFormat('webp').toBuffer();
          const thumbFile = bucket.file(thumbDest);
          await thumbFile.save(thumbBuf, { contentType: 'image/webp' });
          await thumbFile.makePublic();
          const [tUrl] = await thumbFile.getSignedUrl({ action: 'read', expires: '03-01-2500' });
          thumbUrl = tUrl;
        } catch (thumbErr) {
          console.error('Failed to create thumbnail', thumbErr);
        }

        uploaded.push({ url, thumbnailUrl: thumbUrl });
      } catch (err) {
        console.error('Failed to cache image', u, err);
      }
    }

    return { images: uploaded, slug };
  } catch (err) {
    console.error('cacheProductImages failed', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'cacheProductImages failed');
  }
});

