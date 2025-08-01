import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import admin from 'firebase-admin';

// This function lists files in Google Drive and also works with shared drives
// by passing supportsAllDrives and includeItemsFromAllDrives to the API calls.

if (!admin.apps.length) {
  admin.initializeApp();
}

function extractFileId(url) {
  if (!url) return null;
  // Prefer folder style URLs used elsewhere in the project
  let match = /\/folders\/([^/?]+)/.exec(url);
  if (match) return match[1];
  // Fallback for file URLs
  match = /\/file\/d\/([^/?]+)/.exec(url);
  if (match) return match[1];
  // Fallback for URLs with ?id=
  match = /[?&]id=([^&]+)/.exec(url);
  return match ? match[1] : null;
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

  const metaRes = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,webContentLink',
    supportsAllDrives: true,
  });
  const meta = metaRes.data || {};

  if (meta.mimeType === 'application/vnd.google-apps.folder') {
    const res = await drive.files.list({
      q: `'${meta.id}' in parents and trashed=false`,
      fields: 'files(id,name,webContentLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
    const files = res.data.files || [];
    const results = files.map((f) => ({ name: f.name, url: f.webContentLink, campaign }));
    return { results };
  }

  return { results: [{ name: meta.name, url: meta.webContentLink, campaign }] };
});
