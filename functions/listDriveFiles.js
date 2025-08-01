import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import admin from 'firebase-admin';


if (!admin.apps.length) {
  admin.initializeApp();
}

function extractFileId(url) {
  if (!url) return null;
  const match = url.match(/[\w-]{25,}/);
  return match ? match[0] : null;
}

export const listDriveFiles = onCallFn({ timeoutSeconds: 60, memory: '256MiB' }, async (data) => {
  const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
  const { driveFolderUrl, campaign } = payload || {};
  if (!driveFolderUrl || driveFolderUrl.trim() === '') {
    throw new HttpsError('invalid-argument', 'Missing driveFolderUrl');
  }
  const fileId = extractFileId(driveFolderUrl);
  if (!fileId) {
    throw new HttpsError('invalid-argument', 'Invalid driveFolderUrl');
  }
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  const metaRes = await drive.files.get({ fileId, fields: 'id,name,mimeType,webContentLink' });
  const meta = metaRes.data || {};
  if (meta.mimeType === 'application/vnd.google-apps.folder') {
    const res = await drive.files.list({ q: `'${fileId}' in parents and trashed=false`, fields: 'files(id,name,webContentLink)' });
    const files = res.data.files || [];
    const results = files.map((f) => ({ name: f.name, url: f.webContentLink, campaign }));
    return { results };
  }
  const result = { name: meta.name, url: meta.webContentLink, campaign };
  return { results: [result] };
});
