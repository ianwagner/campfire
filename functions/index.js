import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as functions from 'firebase-functions';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import admin from 'firebase-admin';
import sharp from 'sharp';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import {
  createTaggerJob,
  onTaggerJobCreated,
  onTaggerJobUpdated,
  runLowPriorityJobs,
} from './taggerQueue.js';
import { generateThumbnailsForAssets } from './thumbnails.js';

if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  });
}

const db = admin.firestore();


export const processUpload = onObjectFinalized(async (event) => {
  const object = event.data;
  const { bucket, name, contentType } = object;
  if (!contentType || !contentType.startsWith('image/png')) {
    return null;
  }

  console.log('📦 Accessing storage bucket:', bucket);
  let bucketRef;
  try {
    bucketRef = admin.storage().bucket(bucket);
    if (!bucketRef) throw new Error('bucket() returned undefined');
  } catch (err) {
    console.error('❌ Failed to get bucket', err);
    return null;
  }
  const temp = path.join(os.tmpdir(), path.basename(name));
  await bucketRef.file(name).download({ destination: temp });

  const base = path.basename(name, path.extname(name));
  const dir = path.dirname(name);
  const webpLocal = path.join(os.tmpdir(), base + '.webp');
  const thumbLocal = path.join(os.tmpdir(), base + '_thumb.webp');

  await sharp(temp).toFormat('webp').toFile(webpLocal);
  await sharp(temp).resize({ width: 300 }).toFormat('webp').toFile(thumbLocal);

  const webpDest = path.join(dir, base + '.webp');
  const thumbDest = path.join(dir, base + '_thumb.webp');
  await bucketRef.upload(webpLocal, { destination: webpDest, contentType: 'image/webp' });
  await bucketRef.upload(thumbLocal, { destination: thumbDest, contentType: 'image/webp' });

  await fs.unlink(temp).catch(() => {});
  await fs.unlink(webpLocal).catch(() => {});
  await fs.unlink(thumbLocal).catch(() => {});

  const [webpUrl] = await bucketRef.file(webpDest).getSignedUrl({ action: 'read', expires: '03-01-2500' });
  const [thumbUrl] = await bucketRef.file(thumbDest).getSignedUrl({ action: 'read', expires: '03-01-2500' });

  const parts = name.split('/');
  if (parts.length < 6) return null;
  const brandSeg = parts[2];
  const groupSeg = parts[4];
  const filename = parts[5];

  const groupQuery = await db.collection('adGroups')
    .where('brandCode', '==', brandSeg)
    .where('name', '==', groupSeg)
    .limit(1)
    .get();
  if (groupQuery.empty) {
    console.log('No matching ad group for', name);
    return null;
  }
  const groupDoc = groupQuery.docs[0];
  const assetQuery = await groupDoc.ref.collection('assets')
    .where('filename', '==', filename)
    .limit(1)
    .get();
  if (assetQuery.empty) {
    console.log('No asset doc for', filename);
    return null;
  }
  await assetQuery.docs[0].ref.update({
    webpUrl: webpUrl,
    thumbnailUrl: thumbUrl,
  });
  return null;
});

export const signOutUser = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  const uid = data.uid;
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid');
  }
  await admin.auth().revokeRefreshTokens(uid);
  return { success: true };
});

export const sendNotification = onDocumentCreated('notifications/{id}', async (event) => {
  console.log('⚡ sendNotification triggered');

  const snap = event.data;
  const data = snap.data();

if (!data) {
  console.log('❌ No data found in Firestore snapshot');
  return null;
}

// 🛡 Avoid double triggers
if (data.sentAt) {
  console.log('⏭ Notification already sent. Skipping.');
  return null;
}

  console.log('📨 Notification data:', data);

  if (data.triggerTime && data.triggerTime.toDate) {
    const ts = data.triggerTime.toDate();
    if (ts > new Date()) {
      console.log('⏳ Skipping, triggerTime is in the future:', ts);
      return null;
    }
  }

  const tokens = new Set();
  let userQuery = db.collection('users').where('audience', '==', data.audience);
  if (data.brandCode) {
    userQuery = userQuery.where('brandCodes', 'array-contains', data.brandCode);
  }
  const q = await userQuery.get();

  console.log(`🔍 Found ${q.size} users for audience "${data.audience}"`);

  q.forEach((doc) => {
    const t = doc.get('fcmToken');
    if (t) tokens.add(t);
  });

  const tokenArray = Array.from(tokens);
  console.log('🎯 Tokens collected:', tokenArray.length);

  if (tokenArray.length) {
    await admin.messaging().sendEachForMulticast({
      tokens: tokenArray,
      notification: { title: data.title, body: data.body },
    });
    console.log('✅ Notification sent');
  } else {
    console.log('⚠️ No tokens found for this audience');
  }

  await snap.ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
  return null;
});

function applyTemplate(tpl, data) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (data[k] ?? ''));
}

async function runRules(trigger, data) {
  if (!data.brandCode && Array.isArray(data.brandCodes) && data.brandCodes.length > 0) {
    data.brandCode = data.brandCodes[0];
  }
  const snap = await db.collection('notificationRules').where('trigger', '==', trigger).get();
  if (snap.empty) return;
  const rules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  await Promise.all(rules.map((r) => {
    if (r.active === false) return null;
    const title = applyTemplate(r.titleTemplate || '', data);
    const body = applyTemplate(r.bodyTemplate || '', data);
    const doc = {
      title,
      body,
      audience: r.audience || '',
      sendNow: true,
      triggerTime: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ruleId: r.id,
    };
    if (data.url) doc.url = data.url;
    if (data.brandCode) doc.brandCode = data.brandCode;
    return db.collection('notifications').add(doc);
  }));
}

export const notifyAdGroupCreated = onDocumentCreated('adGroups/{id}', async (event) => {
  const data = event.data.data() || {};
  await runRules('adGroupCreated', {
    brandCode: Array.isArray(data.brandCodes) ? data.brandCodes[0] : data.brandCode,
    brandCodes: Array.isArray(data.brandCodes) ? data.brandCodes : [data.brandCode].filter(Boolean),
    status: data.status,
    name: data.name,
    url: `/ad-group/${event.params.id}`,
  });
  return null;
});

export const notifyAdGroupStatusUpdated = onDocumentUpdated('adGroups/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status) return null;
  const noisy = new Set(['in review', 'review pending']);
  if (noisy.has(after.status)) return null;
  if (after.lastStatusNotified === after.status) return null;
  await Promise.all([
    runRules('adGroupStatusUpdated', {
      brandCode: Array.isArray(after.brandCodes) ? after.brandCodes[0] : after.brandCode,
      brandCodes: Array.isArray(after.brandCodes) ? after.brandCodes : [after.brandCode].filter(Boolean),
      status: after.status,
      name: after.name,
      url: `/ad-group/${event.params.id}`,
    }),
    event.data.after.ref.update({ lastStatusNotified: after.status }),
  ]);
  return null;
});

export const notifyAccountCreated = onDocumentCreated('users/{id}', async (event) => {
  const data = event.data.data() || {};
  await runRules('accountCreated', {
    displayName: data.displayName,
    email: data.email,
    audience: data.audience,
    brandCode: Array.isArray(data.brandCodes) && data.brandCodes.length > 0 ? data.brandCodes[0] : data.brandCode,
    brandCodes: Array.isArray(data.brandCodes) ? data.brandCodes : [],
  });
  return null;
});

export {
  createTaggerJob,
  onTaggerJobCreated,
  onTaggerJobUpdated,
  runLowPriorityJobs,
  generateThumbnailsForAssets,
};
