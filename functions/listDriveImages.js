import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

function extractFolderId(url) {
  if (!url) return null;
  const m = url.match(/\/folders\/([^/?]+)/);
  return m ? m[1] : null;
}

async function listImages(folderId, drive) {
  let pageToken = null;
  const files = [];
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: 'nextPageToken, files(id,name,webContentLink)',
      pageToken,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return files;
}

export const listDriveImages = onCallFn({ timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  const { folderUrl } = request.data || request;
  if (!folderUrl) {
    throw new HttpsError('invalid-argument', 'folderUrl is required');
  }
  const folderId = extractFolderId(folderUrl);
  if (!folderId) {
    throw new HttpsError('invalid-argument', 'Invalid folderUrl');
  }
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  const files = await listImages(folderId, drive);
  return { files: files.map(f => ({ name: f.name, url: f.webContentLink })) };
});
