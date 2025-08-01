import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import admin from 'firebase-admin';
import { extractFileId } from './listDriveFiles.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const verifyDriveAccess = onCallFn({ timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  const payload = request && typeof request === 'object' && 'data' in request ? request.data : request;
  const url = payload?.url || payload?.driveFolderUrl || payload?.driveUrl || payload;
  if (!url || typeof url !== 'string') {
    throw new HttpsError('invalid-argument', 'url is required');
  }
  const fileId = extractFileId(url);
  if (!fileId) {
    throw new HttpsError('invalid-argument', 'Invalid Drive URL');
  }
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  try {
    const metaRes = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });
    const meta = metaRes.data || {};
    let targetId = fileId;
    if (meta.mimeType === 'application/vnd.google-apps.folder') {
      const listRes = await drive.files.list({
        q: `'${fileId}' in parents and trashed=false`,
        pageSize: 1,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
      });
      const first = (listRes.data.files || [])[0];
      if (!first) throw new Error('Folder is empty or inaccessible');
      targetId = first.id;
    }
    await drive.files.get({ fileId: targetId, fields: 'id', supportsAllDrives: true });
    return { success: true };
  } catch (err) {
    console.error('Drive access verification failed', err);
    throw new HttpsError('permission-denied', err.message || 'Access denied');
  }
});
