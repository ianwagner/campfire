import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const listDriveFiles = onCallFn({ timeoutSeconds: 60, memory: '256MiB' }, async (data) => {
  const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
  const { driveFolderUrl, campaign } = payload || {};
  if (!driveFolderUrl || driveFolderUrl.trim() === '') {
    throw new HttpsError('invalid-argument', 'Missing driveFolderUrl');
  }
  const match = /\/folders\/([^/?]+)/.exec(driveFolderUrl);
  if (!match) {
    throw new HttpsError('invalid-argument', 'Invalid driveFolderUrl');
  }
  const folderId = match[1];
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  const res = await drive.files.list({ q: `'${folderId}' in parents and trashed=false`, fields: 'files(id,name,webContentLink)' });
  const files = res.data.files || [];
  const results = files.map((f) => ({ name: f.name, url: f.webContentLink, campaign }));
  return { results };
});
