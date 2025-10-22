import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import admin from 'firebase-admin';
import { getSharp } from './shared/lazySharp.js';

// Generates thumbnails for Drive files and supports shared drives via
// supportsAllDrives on download calls.
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

let ffmpegInitPromise;

async function getFfmpegInstance() {
  if (!ffmpegInitPromise) {
    ffmpegInitPromise = (async () => {
      try {
        const [ffmpegModule, ffmpegInstaller] = await Promise.all([
          import('fluent-ffmpeg'),
          import('@ffmpeg-installer/ffmpeg'),
        ]);
        const ffmpeg = ffmpegModule.default || ffmpegModule;
        const installerPath =
          ffmpegInstaller?.path ||
          (typeof ffmpegInstaller?.default === 'object' ? ffmpegInstaller.default.path : undefined);
        const hasBinary = typeof installerPath === 'string' && installerPath.length > 0;
        if (hasBinary) {
          ffmpeg.setFfmpegPath(installerPath);
        } else {
          console.warn(
            '⚠️  FFmpeg binary path could not be resolved. Video thumbnail extraction will be disabled.',
          );
        }
        return { ffmpeg, hasBinary };
      } catch (err) {
        console.warn('⚠️  Failed to load FFmpeg, video thumbnail extraction will be disabled.', err);
        return { ffmpeg: null, hasBinary: false };
      }
    })();
  }
  return ffmpegInitPromise;
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv']);

function looksLikeVideo(value) {
  if (!value) return false;
  const lower = value.split('?')[0].toLowerCase();
  for (const ext of VIDEO_EXTENSIONS) {
    if (lower.endsWith(`.${ext}`)) return true;
  }
  return false;
}

async function extractVideoFrame(inputPath, outputPath) {
  const { ffmpeg, hasBinary } = await getFfmpegInstance();
  if (!hasBinary || !ffmpeg) {
    throw new Error('FFmpeg is not available for video thumbnail generation.');
  }
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-ss', '00:00:01'])
      .outputOptions(['-frames:v 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

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

  let sharpInstance;
  for (const asset of assets) {
    const { url, name } = asset || {};
    const result = { url, name };
    const cleanupPaths = new Set();
    try {
      const fileId = extractFileId(url);
      if (!fileId) throw new Error('Invalid Drive URL');
      let mimeType = '';
      let fileExtension = '';
      try {
        const metaRes = await drive.files.get({
          fileId,
          fields: 'mimeType, fileExtension',
          supportsAllDrives: true,
        });
        mimeType = metaRes.data?.mimeType || '';
        fileExtension = metaRes.data?.fileExtension || '';
      } catch (metaErr) {
        console.warn('⚠️  Failed to load metadata for file, falling back to url checks', fileId, metaErr);
      }
      const isVideo =
        mimeType.startsWith('video/') ||
        VIDEO_EXTENSIONS.has(fileExtension.toLowerCase()) ||
        looksLikeVideo(name) ||
        looksLikeVideo(url);
      const tmp = path.join(os.tmpdir(), fileId);
      cleanupPaths.add(tmp);
      const dl = await drive.files.get({
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      }, { responseType: 'arraybuffer' });
      await fs.writeFile(tmp, Buffer.from(dl.data));
      let inputTmp = tmp;
      if (isVideo) {
        const { hasBinary } = await getFfmpegInstance();
        if (!hasBinary) {
          console.warn('⚠️  Skipping video frame extraction because FFmpeg is unavailable.', { fileId, name });
          throw new Error('FFmpeg is not available for video thumbnail generation.');
        }
        const frameTmp = path.join(os.tmpdir(), `${fileId}-frame.jpg`);
        cleanupPaths.add(frameTmp);
        await extractVideoFrame(tmp, frameTmp);
        inputTmp = frameTmp;
      } else {
        sharpInstance = sharpInstance || (await getSharp());
        const meta = await sharpInstance(tmp).metadata().catch(() => ({}));
        if (meta.format === 'tiff') {
          const pngTmp = path.join(os.tmpdir(), `${fileId}.png`);
          cleanupPaths.add(pngTmp);
          await sharpInstance(tmp).toFormat('png').toFile(pngTmp);
          inputTmp = pngTmp;
        }
      }
      const thumbTmp = path.join(os.tmpdir(), `${fileId}.webp`);
      cleanupPaths.add(thumbTmp);
      sharpInstance = sharpInstance || (await getSharp());
      await sharpInstance(inputTmp).resize({ width: 300 }).toFormat('webp').toFile(thumbTmp);
      const dest = `thumbnails/${name}.webp`;
      await bucket.upload(thumbTmp, { destination: dest, contentType: 'image/webp', resumable: false });
      await bucket.file(dest).makePublic();
      result.thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${dest}`;
    } catch (err) {
      console.error('Failed processing', name, err);
      result.error = err.message || 'error';
    } finally {
      await Promise.all([...cleanupPaths].map((p) => fs.unlink(p).catch(() => {})));
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
