const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sharp = require('sharp');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

admin.initializeApp();
const db = admin.firestore();


exports.processUpload = functions.storage.object().onFinalize(async (object) => {
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

async function dispatchNotification(ref, data) {
  const tokens = [];
  // Fetch FCM tokens for users with matching role
  const userQuery = await db
    .collection('users')
    .where('role', '==', data.audience)
    .get();
  userQuery.forEach((doc) => {
    const t = doc.get('fcmToken');
    if (t) tokens.push(t);
  });
  if (tokens.length) {
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: data.title, body: data.body },
    });
  }
  await ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
}

exports.sendNotification = functions.firestore
  .document('notifications/{id}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (!data) return null;
    if (data.triggerTime && data.triggerTime.toDate) {
      const ts = data.triggerTime.toDate();
      if (ts > new Date()) {
        // Will be picked up by the scheduled processor
        return null;
      }
    }
    await dispatchNotification(snap.ref, data);
    return null;
  });

exports.processPendingNotifications = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const snap = await db
      .collection('notifications')
      .where('sentAt', '==', null)
      .get();
    const now = new Date();
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (
        data.triggerTime &&
        data.triggerTime.toDate &&
        data.triggerTime.toDate() > now
      ) {
        continue;
      }
      await dispatchNotification(docSnap.ref, data);
    }
    return null;
  });
