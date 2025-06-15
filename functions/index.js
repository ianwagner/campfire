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
  console.log('Dispatching notification for doc:', ref.id);
  console.log('Notification data:', data);

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

  console.log('Sending to tokens:', tokens);

  if (tokens.length) {
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: data.title, body: data.body },
      });
      console.log(
        `FCM result - success: ${res.successCount}, failure: ${res.failureCount}`
      );
      res.responses.forEach((r, idx) => {
        if (!r.success) {
          console.error(
            `Error sending to token ${tokens[idx]}:`,
            r.error
          );
        }
      });
    } catch (err) {
      console.error('Error sending FCM message:', err);
    }
  }

  await ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
}

exports.sendNotification = functions.firestore
  .document('notifications/{id}')
  .onCreate(async (snap, context) => {
    console.log('sendNotification triggered for document:', context.params.id);
    const data = snap.data();
    if (!data) {
      console.log('No data found in notification document');
      return null;
    }
    console.log('Notification doc data:', data);
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

exports.notifyOnAdGroupReviewed = functions.firestore
  .document('adGroups/{id}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after) return null;
    if (before.status !== 'reviewed' && after.status === 'reviewed') {
      await db.collection('notifications').add({
        title: 'Ad Group Reviewed',
        body: `Ad group ${after.name || context.params.id} has been reviewed`,
        audience: 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return null;
  });

function getFieldValue(obj, path) {
  return path.split('.').reduce((val, key) => {
    if (val === undefined || val === null) return undefined;
    return val[key];
  }, obj);
}

function evaluateConditions(data, conditions) {
  return (conditions || []).every((c) => {
    const op = c.operator || c.op || '==';
    const fieldVal = getFieldValue(data, c.field);
    switch (op) {
      case '==':
        return fieldVal === c.value;
      case '!=':
        return fieldVal !== c.value;
      case '<':
        return fieldVal < c.value;
      case '<=':
        return fieldVal <= c.value;
      case '>':
        return fieldVal > c.value;
      case '>=':
        return fieldVal >= c.value;
      case 'includes':
        if (Array.isArray(fieldVal)) return fieldVal.includes(c.value);
        if (typeof fieldVal === 'string') return fieldVal.includes(c.value);
        return false;
      default:
        return false;
    }
  });
}

exports.watchAdGroupRules = functions.firestore
  .document('adGroups/{id}')
  .onUpdate(async (change, context) => {
    const after = change.after.data();
    if (!after) return null;

    const rulesSnap = await db
      .collection('notificationRules')
      .where('trigger', '==', 'adGroupStatusUpdated')
      .get();

    for (const docSnap of rulesSnap.docs) {
      const rule = docSnap.data();
      if (evaluateConditions(after, rule.conditions)) {
        await db.collection('notifications').add({
          audience: rule.recipient,
          title: 'Ad Group Status Updated',
          body: rule.message,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return null;
  });
