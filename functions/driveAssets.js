import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { google } from 'googleapis';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });

function sanitize(str) {
  return (str || '').replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim();
}

async function ensureFolder(name, parentId, drive) {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  if (res.data.files && res.data.files.length) return res.data.files[0].id;
  const create = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return create.data.id;
}

export const copyAssetToDrive = onDocumentCreated('adGroups/{groupId}/assets/{assetId}', async (event) => {
  const data = event.data.data() || {};
  const { filename, firebaseUrl, brandCode, recipeCode, uploadedAt } = data;
  if (!firebaseUrl || !uploadedAt) return null;

  const groupSnap = await db.doc(`adGroups/${event.params.groupId}`).get();
  const groupName = groupSnap.exists ? groupSnap.data().name || event.params.groupId : event.params.groupId;

  const brandSnap = await db.collection('brands').where('code', '==', brandCode).limit(1).get();
  if (brandSnap.empty) return null;
  const brandData = brandSnap.docs[0].data() || {};
  const rootFolder = brandData.driveFolderId;
  if (!rootFolder) return null;

  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });

  const base = `${sanitize(brandCode)}_${sanitize(groupName)}`;
  const folderName = `${base}_${recipeCode || 'unknown'}`;
  const folderId = await ensureFolder(folderName, rootFolder, drive);

  const res = await fetch(firebaseUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const upload = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: 'application/octet-stream', body: buffer },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  });

  await event.data.ref.update({
    driveFileId: upload.data.id,
    driveFileUrl: upload.data.webViewLink,
  });
  return null;
});

export const cleanupDriveFile = onDocumentUpdated('adGroups/{groupId}/assets/{assetId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status) return null;
  if (!['archived', 'rejected'].includes(after.status)) return null;
  const fileId = before.driveFileId || after.driveFileId;
  if (!fileId) return null;
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (err) {
    console.error('Failed to delete Drive file', err?.message || err?.toString());
  }
  return null;
});
