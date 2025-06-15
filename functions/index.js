const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const functions = require('firebase-functions');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const sharp = require('sharp');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

admin.initializeApp();
const db = admin.firestore();


exports.processUpload = onObjectFinalized(async (event) => {
  const object = event.data;
  const { bucket, name, contentType } = object;
  if (!contentType || !contentType.startsWith('image/png')) {
    return null;
  }

  const bucketRef = admin.storage().bucket(bucket);
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

exports.signOutUser = functions.https.onCall(async (data, context) => {
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

exports.sendNotification = onDocumentCreated('notifications/{id}', async (event) => {
  console.log('⚡ sendNotification triggered');

  const snap = event.data;
  const data = snap.data();

  if (!data) {
    console.log('❌ No data found in Firestore snapshot');
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
  const q = await db
    .collection('users')
    .where('audience', '==', data.audience)
    .get();

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
