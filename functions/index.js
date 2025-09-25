import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import admin from 'firebase-admin';
import sharp from 'sharp';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import https from 'https';
import { tagger } from './tagger.js';
import { generateThumbnailsForAssets, deleteThumbnails } from './thumbnails.js';
import { generateTagsForAssets } from './tagAssets.js';
import { listDriveFiles } from './listDriveFiles.js';
import { verifyDriveAccess } from './verifyDriveAccess.js';
import { parsePdp } from './parsePdp.js';
import { cacheProductImages } from './cacheProductImages.js';
import { copyAssetToDrive, cleanupDriveFile } from './driveAssets.js';
import { openaiProxy } from './openaiProxy.js';
import * as functionsV1 from 'firebase-functions/v1';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const SLACK_BOT_TOKEN =
  process.env.SLACK_BOT_TOKEN || functionsV1.config().slack?.bot_token || '';


async function postSlackMessage(channelId, text) {
  if (!SLACK_BOT_TOKEN) {
    console.warn('SLACK_BOT_TOKEN is not configured; skipping Slack notification');
    return;
  }

  const payload = JSON.stringify({ channel: channelId, text });

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'slack.com',
        path: '/api/chat.postMessage',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf8');

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Slack API HTTP ${res.statusCode}: ${bodyText}`));
            return;
          }

          if (!bodyText) {
            resolve();
            return;
          }

          let parsed;
          try {
            parsed = JSON.parse(bodyText);
          } catch (err) {
            reject(new Error(`Slack API parse error: ${err.message}`));
            return;
          }

          if (parsed && parsed.ok === false) {
            reject(new Error(`Slack API error: ${parsed.error || 'unknown_error'}`));
            return;
          }

          resolve();
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendSlackNotificationToBrand(brandCode, text) {
  if (!SLACK_BOT_TOKEN) {
    return;
  }

  const normalizedBrand = (brandCode || '').trim();
  if (!normalizedBrand) {
    console.warn('Missing brand code for Slack notification');
    return;
  }

  let channelDocs = [];

  try {
    const snap = await db
      .collection('slackChannelMappings')
      .where('brandCode', '==', normalizedBrand)
      .get();
    if (!snap.empty) {
      channelDocs = snap.docs;
    } else {
      const fallbackSnap = await db.collection('slackChannelMappings').get();
      channelDocs = fallbackSnap.docs.filter((doc) => {
        const stored = doc.data()?.brandCode;
        return (
          typeof stored === 'string' && stored.trim().toLowerCase() === normalizedBrand.toLowerCase()
        );
      });
    }
  } catch (err) {
    console.error('Failed to load Slack channel mappings', err);
    return;
  }

  if (!channelDocs.length) {
    console.log(`No Slack channels connected for brand ${normalizedBrand}; skipping notification.`);
    return;
  }

  await Promise.all(
    channelDocs.map(async (doc) => {
      const channelId = doc.id;
      try {
        await postSlackMessage(channelId, text);
      } catch (err) {
        console.error(`Failed to send Slack message to channel ${channelId}`, err);
      }
    })
  );
}


function parseAdFilename(filename) {
  if (!filename) return {};
  const name = filename.replace(/\.[^/.]+$/, '');
  const parts = name.split('_');

  const brandCode = parts[0] || '';
  const adGroupCode = parts[1] || '';
  const recipeCode = parts[2] || '';

  let aspectRatio = '';
  let version;

  if (parts.length >= 5) {
    aspectRatio = parts[3] || '';
    const match = /^V(\d+)/i.exec(parts[4]);
    if (match) version = parseInt(match[1], 10);
  } else if (parts.length === 4) {
    const match = /^V(\d+)/i.exec(parts[3]);
    if (match) {
      version = parseInt(match[1], 10);
    } else {
      aspectRatio = parts[3] || '';
    }
  }

  return { brandCode, adGroupCode, recipeCode, aspectRatio, version };
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

async function recomputeBrandStats(brandId) {
  const brandSnap = await db.collection('brands').doc(brandId).get();
  if (!brandSnap.exists) return;
  const brand = brandSnap.data() || {};
  const brandCode = brand.code || brand.codeId || '';
  const name = brand.name || '';

  const contractedCounts = {};
  const contracts = Array.isArray(brand.contracts) ? brand.contracts : [];
  for (const c of contracts) {
    if (!c.startDate) continue;
    const stills = Number(c.stills || 0);
    const videos = Number(c.videos || 0);
    let current = new Date(`${c.startDate}-01`);
    const end = c.endDate ? new Date(`${c.endDate}-01`) : null;
    let loops = 0;
    while (current && (!end || current <= end)) {
      const key = monthKey(current);
      contractedCounts[key] = (contractedCounts[key] || 0) + stills + videos;
      current = new Date(current);
      current.setDate(1);
      current.setMonth(current.getMonth() + 1);
      loops++;
      if (!c.renews && !c.endDate) break; // single-month contract
      if (!end && loops >= 60) break; // limit unlimited contracts to 5 years
    }
  }

  const briefedCounts = {};
  const deliveredSets = {};
  const approvedSets = {};

  const groupSnap = await db.collection('adGroups').where('brandCode', '==', brandCode).get();
  for (const g of groupSnap.docs) {
    const gData = g.data() || {};
    const dueDate = gData.dueDate && gData.dueDate.toDate ? gData.dueDate.toDate() : null;
    const mKey = gData.month || (dueDate ? monthKey(dueDate) : null);
    if (!mKey) continue;

    let recipeSnap;
    try {
      recipeSnap = await g.ref.collection('recipes').get();
    } catch (err) {
      recipeSnap = { docs: [] };
    }

    const assetsSnap = await g.ref.collection('assets').get();
    const assetRecipes = new Set();
    if (!deliveredSets[mKey]) deliveredSets[mKey] = new Set();
    if (!approvedSets[mKey]) approvedSets[mKey] = new Set();
    const deliveredSet = deliveredSets[mKey];
    const approvedSet = approvedSets[mKey];

    // count recipe statuses
    recipeSnap.docs.forEach((r) => {
      const rData = r.data() || {};
      const key = `${g.id}-${r.id}`;
      if (['ready', 'approved', 'rejected', 'edit_requested'].includes(rData.status)) {
        deliveredSet.add(key);
      }
      if (rData.status === 'approved') {
        approvedSet.add(key);
      }
    });

    // fall back to assets
    assetsSnap.docs.forEach((ad) => {
      const data = ad.data() || {};
      const info = parseAdFilename(data.filename || '');
      const recipe = data.recipeCode || info.recipeCode || '';
      if (!recipe) return;
      const groupCode = data.adGroupCode || info.adGroupCode || g.id;
      const key = `${groupCode}-${recipe}`;
      assetRecipes.add(key);
      if (['ready', 'approved', 'rejected', 'edit_requested'].includes(data.status)) {
        deliveredSet.add(key);
      }
      if (data.status === 'approved') {
        approvedSet.add(key);
      }
    });

    const recipeCount =
      recipeSnap.docs.length > 0 ? recipeSnap.docs.length : assetRecipes.size;
    briefedCounts[mKey] = (briefedCounts[mKey] || 0) + recipeCount;
  }

  const months = new Set([
    ...Object.keys(contractedCounts),
    ...Object.keys(briefedCounts),
    ...Object.keys(deliveredSets),
    ...Object.keys(approvedSets),
  ]);
  const counts = {};
  months.forEach((m) => {
    counts[m] = {
      contracted: contractedCounts[m] || 0,
      briefed: briefedCounts[m] || 0,
      delivered: deliveredSets[m] ? deliveredSets[m].size : 0,
      approved: approvedSets[m] ? approvedSets[m].size : 0,
    };
  });

  await db.collection('brandStats').doc(brandId).set(
    {
      brandId,
      code: brandCode,
      name,
      agencyId: brand.agencyId || null,
      counts,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export const updateBrandStatsOnBrandChange = onDocumentWritten('brands/{brandId}', async (event) => {
  await recomputeBrandStats(event.params.brandId);
  return null;
});

export const updateBrandStatsOnAssetChange = onDocumentWritten(
  'adGroups/{groupId}/assets/{assetId}',
  async (event) => {
    const groupId = event.params.groupId;
    try {
      const groupSnap = await db.collection('adGroups').doc(groupId).get();
      const brandCode = groupSnap.data()?.brandCode;
      if (!brandCode) return null;
      const brandSnap = await db
        .collection('brands')
        .where('code', '==', brandCode)
        .limit(1)
        .get();
      if (brandSnap.empty) return null;
      const brandId = brandSnap.docs[0].id;
      await recomputeBrandStats(brandId);
    } catch (err) {
      console.error('Failed to update brand stats on asset change', err);
    }
    return null;
  }
);

export const updateBrandStatsOnAdGroupChange = onDocumentWritten(
  'adGroups/{groupId}',
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    const beforeDue = before.dueDate?.toMillis ? before.dueDate.toMillis() : before.dueDate;
    const afterDue = after.dueDate?.toMillis ? after.dueDate.toMillis() : after.dueDate;
    const dueDateChanged = beforeDue !== afterDue;
    const beforeBrand = before.brandCode;
    const afterBrand = after.brandCode;
    const brandChanged = beforeBrand !== afterBrand;
    const beforeMonth = before.month;
    const afterMonth = after.month;
    const monthChanged = beforeMonth !== afterMonth;
    if (!dueDateChanged && !brandChanged && !monthChanged) return null;

    const brandCodes = new Set();
    if (beforeBrand) brandCodes.add(beforeBrand);
    if (afterBrand) brandCodes.add(afterBrand);

    for (const code of brandCodes) {
      try {
        const snap = await db
          .collection('brands')
          .where('code', '==', code)
          .limit(1)
          .get();
        if (snap.empty) continue;
        const brandId = snap.docs[0].id;
        await recomputeBrandStats(brandId);
      } catch (err) {
        console.error('Failed to update brand stats on ad group change', err);
      }
    }
    return null;
  }
);

export const updateBrandStatsOnRecipeChange = onDocumentWritten(
  'adGroups/{groupId}/recipes/{recipeId}',
  async (event) => {
    const groupId = event.params.groupId;
    try {
      const groupSnap = await db.collection('adGroups').doc(groupId).get();
      const brandCode = groupSnap.data()?.brandCode;
      if (!brandCode) return null;
      const brandSnap = await db
        .collection('brands')
        .where('code', '==', brandCode)
        .limit(1)
        .get();
      if (brandSnap.empty) return null;
      const brandId = brandSnap.docs[0].id;
      await recomputeBrandStats(brandId);
    } catch (err) {
      console.error('Failed to update brand stats on recipe change', err);
    }
    return null;
  }
);

export const processUpload = onObjectFinalized(async (event) => {
  const object = event.data;
  const { bucket, name, contentType } = object;
  if (!contentType || (!contentType.startsWith('image/png') && !contentType.startsWith('image/tiff'))) {
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
  let inputTmp = temp;
  const meta = await sharp(temp).metadata().catch(() => ({}));
  if (meta.format === 'tiff') {
    const pngTmp = path.join(os.tmpdir(), `${base}.png`);
    await sharp(temp).toFormat('png').toFile(pngTmp);
    await fs.unlink(temp).catch(() => {});
    inputTmp = pngTmp;
  }

  const dir = path.dirname(name);
  const webpLocal = path.join(os.tmpdir(), base + '.webp');
  const thumbLocal = path.join(os.tmpdir(), base + '_thumb.webp');

  await sharp(inputTmp).toFormat('webp').toFile(webpLocal);
  await sharp(inputTmp).resize({ width: 300 }).toFormat('webp').toFile(thumbLocal);

  const webpDest = path.join(dir, base + '.webp');
  const thumbDest = path.join(dir, base + '_thumb.webp');
  await bucketRef.upload(webpLocal, { destination: webpDest, contentType: 'image/webp' });
  await bucketRef.upload(thumbLocal, { destination: thumbDest, contentType: 'image/webp' });

  if (inputTmp !== temp) await fs.unlink(inputTmp).catch(() => {});
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

export const signOutUser = onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin only');
  }
  const uid = data.uid;
  if (!uid) {
    throw new HttpsError('invalid-argument', 'Missing uid');
  }
  await admin.auth().revokeRefreshTokens(uid);
  return { success: true };
});

export const createStripeCustomer = onCall(async (data) => {
  console.log('createStripeCustomer payload:', data);
  return { customerId: 'dummy_customer_id' };
});

export const initBrandCredits = onDocumentCreated('brands/{brandId}', async (event) => {
  const snap = event.data;
  if (!snap) return null;
  const data = snap.data();
  if (typeof data.credits !== 'number') {
    await snap.ref.update({ credits: 0 });
  }
  return null;
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

async function syncManagerClaim(uid, role, previousRole) {
  const beforeManager = previousRole === 'manager' || previousRole === 'project-manager' || previousRole === 'ops';
  const afterManager = role === 'manager' || role === 'project-manager' || role === 'ops';
  if (beforeManager === afterManager) return null;
  try {
    const user = await admin.auth().getUser(uid);
    const claims = user.customClaims || {};
    if (afterManager) {
      claims.manager = true;
    } else {
      delete claims.manager;
    }
    await admin.auth().setCustomUserClaims(uid, claims);
  } catch (err) {
    console.error('Failed to sync manager claim', err);
  }
  return null;
}


export const applyManagerClaimOnCreate = onDocumentCreated('users/{id}', async (event) => {
  const data = event.data.data() || {};
  const role = data.role || data.userType || null;
  return syncManagerClaim(event.params.id, role, null);
});


export const applyManagerClaimOnUpdate = onDocumentUpdated('users/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const beforeRole = before.role || before.userType || null;
  const afterRole = after.role || after.userType || null;
  return syncManagerClaim(event.params.id, afterRole, beforeRole);
});

export const cleanupOnProjectDelete = onDocumentDeleted('projects/{projectId}', async (event) => {
  const projectId = event.params.projectId;
  const batch = db.batch();
  try {
    const groups = await db.collection('adGroups').where('projectId', '==', projectId).get();
    groups.forEach((doc) => batch.delete(doc.ref));
    const requests = await db.collection('requests').where('projectId', '==', projectId).get();
    requests.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (err) {
    console.error('Failed to cleanup project', err);
  }
  return null;
});

export const deleteProjectOnGroupDelete = onDocumentDeleted('adGroups/{groupId}', async (event) => {
  const data = event.data.data() || {};
  const projectId = data.projectId;
  if (!projectId) return null;
  try {
    await db.collection('projects').doc(projectId).delete();
  } catch (err) {
    console.error('Failed to delete project for group', err);
  }
  return null;
});

export const deleteProjectOnRequestDelete = onDocumentDeleted('requests/{requestId}', async (event) => {
  const data = event.data.data() || {};
  const projectId = data.projectId;
  if (!projectId) return null;
  try {
    await db.collection('projects').doc(projectId).delete();
  } catch (err) {
    console.error('Failed to delete project for request', err);
  }
  return null;
});

export const archiveProjectOnGroupArchived = onDocumentUpdated('adGroups/{groupId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === 'archived' || after.status !== 'archived') return null;
  const projectId = after.projectId;
  if (!projectId) return null;
  try {
    const reqSnap = await db.collection('requests').where('projectId', '==', projectId).limit(1).get();
    if (!reqSnap.empty && reqSnap.docs[0].data().status === 'done') {
      await db.collection('projects').doc(projectId).update({
        status: 'archived',
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('Failed to archive project on group archive', err);
  }
  return null;
});

export const archiveProjectOnRequestDone = onDocumentUpdated('requests/{requestId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === 'done' || after.status !== 'done') return null;
  const projectId = after.projectId;
  if (!projectId) return null;
  try {
    const groupSnap = await db.collection('adGroups').where('projectId', '==', projectId).limit(1).get();
    if (!groupSnap.empty && groupSnap.docs[0].data().status === 'archived') {
      await db.collection('projects').doc(projectId).update({
        status: 'archived',
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('Failed to archive project on request done', err);
  }
  return null;
});

export const notifySlackOnAdGroupReviewedV1 = functionsV1
  .region('us-central1')
  .firestore.document('adGroups/{groupId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const statusify = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

    const beforeStatus = statusify(before.status);
    const afterStatus = statusify(after.status);

    console.log('🔥 reviewed watcher', {
      groupId: ctx.params.groupId,
      beforeStatus,
      afterStatus,
      brandCode: after.brandCode || before.brandCode || null,
    });

    if (beforeStatus === 'reviewed' || afterStatus !== 'reviewed') return null;

    const sanitizeBrand = (value) => (typeof value === 'string' ? value.trim() : '');

    let brandCode = sanitizeBrand(after.brandCode) || sanitizeBrand(before.brandCode) || '';
    if (!brandCode) {
      const projectId = after.projectId || before.projectId;
      if (projectId) {
        try {
          const projectSnap = await db.collection('projects').doc(projectId).get();
          const project = projectSnap.data() || {};
          brandCode = sanitizeBrand(project.brandCode || project.brand?.code || '');
        } catch (err) {
          console.warn('Failed to load project for reviewed Slack notification', err);
        }
      }
    }

    if (!brandCode) {
      const requestId = after.requestId || before.requestId;
      if (requestId) {
        try {
          const requestSnap = await db.collection('requests').doc(requestId).get();
          const request = requestSnap.data() || {};
          brandCode = sanitizeBrand(request.brandCode || request.brand?.code || '');
        } catch (err) {
          console.warn('Failed to load request for reviewed Slack notification', err);
        }
      }
    }

    if (!brandCode) {
      console.log(
        `Skipping Slack notification for reviewed ad group ${ctx.params.groupId} because brand code is missing.`,
      );
      return null;
    }

    const counts = { approved: 0, edit_requested: 0, rejected: 0 };
    try {
      const assetsSnap = await change.after.ref.collection('assets').get();
      if (!assetsSnap.empty) {
        assetsSnap.forEach((d) => {
          const s = statusify(d.data()?.status);
          if (s === 'approved') counts.approved += 1;
          else if (s === 'edit_requested') counts.edit_requested += 1;
          else if (s === 'rejected') counts.rejected += 1;
        });
      } else {
        counts.approved = Number(after.approvedCount || before.approvedCount || 0);
        counts.edit_requested = Number(after.editCount || before.editCount || 0);
        counts.rejected = Number(after.rejectedCount || before.rejectedCount || 0);
      }
    } catch (err) {
      console.error('Failed to load asset counts for Slack notification', err);
      counts.approved = Number(after.approvedCount || before.approvedCount || 0);
      counts.edit_requested = Number(after.editCount || before.editCount || 0);
      counts.rejected = Number(after.rejectedCount || before.rejectedCount || 0);
    }

    const groupName =
      after.name ||
      before.name ||
      after.adGroupCode ||
      before.adGroupCode ||
      ctx.params.groupId;

    const text =
      `${brandCode ? `[${brandCode}] ` : ''}` +
      `Ad group *${groupName}* has been marked as *reviewed*.\n` +
      `• Approved: ${counts.approved}\n` +
      `• Edit requested: ${counts.edit_requested}\n` +
      `• Rejected: ${counts.rejected}`;

    await sendSlackNotificationToBrand(brandCode, text);
    return null;
  });

export const syncProjectStatus = onDocumentWritten('adGroups/{groupId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const projectId = after.projectId || before.projectId;
  if (!projectId) return null;

  const projectRef = db.collection('projects').doc(projectId);

  if (!event.data.after.exists) {
    try {
      if (before.status === 'archived') {
        await projectRef.update({
          status: 'archived',
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await projectRef.delete();
      }
    } catch (err) {
      console.error('Failed to handle project for deleted ad group', err);
    }
    return null;
  }

  const status = after.status;
  if (!status) return null;
  try {
    await projectRef.update({ status });
  } catch (err) {
    console.error('Failed to sync project status', err);
  }
  return null;
});

export {
  tagger,
  generateThumbnailsForAssets,
  deleteThumbnails,
  generateTagsForAssets,
  listDriveFiles,
  verifyDriveAccess,
  parsePdp,
  cacheProductImages,
  copyAssetToDrive,
  cleanupDriveFile,
  openaiProxy,
};
