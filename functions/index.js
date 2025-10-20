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
import { tagger } from './tagger.js';
import { generateThumbnailsForAssets, deleteThumbnails } from './thumbnails.js';
import { generateTagsForAssets } from './tagAssets.js';
import { listDriveFiles } from './listDriveFiles.js';
import { verifyDriveAccess } from './verifyDriveAccess.js';
import { parsePdp } from './parsePdp.js';
import { cacheProductImages } from './cacheProductImages.js';
import { copyAssetToDrive, cleanupDriveFile } from './driveAssets.js';
import { openaiProxy } from './openaiProxy.js';
import { patchFirestoreProtobufDecoding } from './firestoreProtobufPatch.js';

patchFirestoreProtobufDecoding();

if (!admin.apps.length) {
  admin.initializeApp();
}

function ensureFirebaseConfig() {
  let config = {};
  const rawConfig = process.env.FIREBASE_CONFIG;
  if (rawConfig) {
    try {
      config = JSON.parse(rawConfig);
    } catch (err) {
      console.warn('Failed to parse FIREBASE_CONFIG, falling back to defaults', err);
      config = {};
    }
  }

  const appOptions = admin.app().options || {};

  const projectId =
    config.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    appOptions.projectId ||
    null;

  let storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.STORAGE_BUCKET ||
    config.storageBucket ||
    appOptions.storageBucket ||
    null;

  if (!storageBucket && projectId) {
    storageBucket = `${projectId}.appspot.com`;
  }

  const updatedConfig = { ...config };
  if (projectId && !updatedConfig.projectId) {
    updatedConfig.projectId = projectId;
  }
  if (storageBucket && !updatedConfig.storageBucket) {
    updatedConfig.storageBucket = storageBucket;
  }

  if (Object.keys(updatedConfig).length > 0) {
    process.env.FIREBASE_CONFIG = JSON.stringify(updatedConfig);
  } else if (!process.env.FIREBASE_CONFIG) {
    process.env.FIREBASE_CONFIG = '{}';
  }

  if (storageBucket && !process.env.FIREBASE_STORAGE_BUCKET) {
    process.env.FIREBASE_STORAGE_BUCKET = storageBucket;
  }

  return { projectId, storageBucket };
}

const { storageBucket: defaultStorageBucket } = ensureFirebaseConfig();

const db = admin.firestore();


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

function normalizeStringValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  return '';
}

function normalizeTimestampValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch (err) {
      return null;
    }
  }
  return null;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeStringValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function sanitizeNestedValue(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (depth > 6) return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch (err) {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    const arr = [];
    for (const entry of value) {
      const sanitized = sanitizeNestedValue(entry, depth + 1);
      if (sanitized !== undefined) {
        arr.push(sanitized);
      }
    }
    return arr;
  }
  if (typeof value === 'object') {
    const obj = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeNestedValue(entry, depth + 1);
      if (sanitized !== undefined) {
        obj[key] = sanitized;
      }
    }
    return obj;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return undefined;
}

function buildNormalizedAssetDoc(assetId, groupId, assetData = {}, groupData = {}) {
  const normalized = { id: assetId, adGroupId: groupId };
  const filenameInfo = parseAdFilename(assetData.filename || '');

  const resolvedBrandCode =
    normalizeStringValue(assetData.brandCode) || normalizeStringValue(groupData.brandCode);
  if (resolvedBrandCode) normalized.brandCode = resolvedBrandCode;

  const resolvedGroupCode =
    normalizeStringValue(assetData.adGroupCode) ||
    normalizeStringValue(filenameInfo.adGroupCode) ||
    normalizeStringValue(groupData.code);
  if (resolvedGroupCode) normalized.adGroupCode = resolvedGroupCode;

  const resolvedRecipeCode =
    normalizeStringValue(assetData.recipeCode) || normalizeStringValue(filenameInfo.recipeCode);
  if (resolvedRecipeCode) normalized.recipeCode = resolvedRecipeCode;

  const resolvedAspectRatio =
    normalizeStringValue(assetData.aspectRatio) || normalizeStringValue(filenameInfo.aspectRatio);
  if (resolvedAspectRatio) normalized.aspectRatio = resolvedAspectRatio;

  const resolvedVersion =
    Number.isFinite(assetData.version) ? Math.trunc(assetData.version) : filenameInfo.version;
  if (Number.isFinite(resolvedVersion)) normalized.version = resolvedVersion;

  const status = normalizeStringValue(assetData.status);
  if (status) normalized.status = status;

  const filename = normalizeStringValue(assetData.filename);
  if (filename) normalized.filename = filename;

  const name = normalizeStringValue(assetData.name);
  if (name) normalized.name = name;

  const product = normalizeStringValue(assetData.product);
  if (product) normalized.product = product;

  const campaign = normalizeStringValue(assetData.campaign);
  if (campaign) normalized.campaign = campaign;

  const persona = normalizeStringValue(assetData.persona);
  if (persona) normalized.persona = persona;

  const angle = normalizeStringValue(assetData.angle);
  if (angle) normalized.angle = angle;

  const primaryText = normalizeStringValue(assetData.primaryText);
  if (primaryText) normalized.primaryText = primaryText;

  const headline = normalizeStringValue(assetData.headline);
  if (headline) normalized.headline = headline;

  const type = normalizeStringValue(assetData.type);
  if (type) normalized.type = type;

  const description = normalizeStringValue(assetData.description);
  if (description) normalized.description = description;

  const thumbnailUrl = normalizeStringValue(assetData.thumbnailUrl);
  if (thumbnailUrl) normalized.thumbnailUrl = thumbnailUrl;

  const lastUpdatedBy = normalizeStringValue(assetData.lastUpdatedBy);
  if (lastUpdatedBy) normalized.lastUpdatedBy = lastUpdatedBy;

  const parentAdId = normalizeStringValue(assetData.parentAdId);
  if (parentAdId) normalized.parentAdId = parentAdId;

  const downloadUrl = normalizeStringValue(assetData.downloadUrl);
  if (downloadUrl) normalized.downloadUrl = downloadUrl;

  const firebaseUrl = normalizeStringValue(assetData.firebaseUrl);
  if (firebaseUrl) normalized.firebaseUrl = firebaseUrl;

  const exportUrl = normalizeStringValue(assetData.exportUrl);
  if (exportUrl) normalized.exportUrl = exportUrl;

  const sourceUrl = normalizeStringValue(assetData.sourceUrl);
  if (sourceUrl) normalized.sourceUrl = sourceUrl;

  const url = normalizeStringValue(assetData.url);
  if (url) normalized.url = url;

  const driveFileId = normalizeStringValue(assetData.driveFileId);
  if (driveFileId) normalized.driveFileId = driveFileId;

  const driveFileUrl = normalizeStringValue(assetData.driveFileUrl);
  if (driveFileUrl) normalized.driveFileUrl = driveFileUrl;

  const resolvedAssetUrl = [
    assetData.exportUrl,
    assetData.assetUrl,
    assetData.firebaseUrl,
    assetData.url,
    assetData.sourceUrl,
    assetData.downloadUrl,
  ]
    .map((candidate) => normalizeStringValue(candidate))
    .find((candidate) => candidate);
  if (resolvedAssetUrl) normalized.assetUrl = resolvedAssetUrl;

  if (Object.prototype.hasOwnProperty.call(assetData, 'comment')) {
    if (assetData.comment === null) {
      normalized.comment = null;
    } else {
      const comment = normalizeStringValue(assetData.comment);
      if (comment) normalized.comment = comment;
    }
  }

  if (typeof assetData.isResolved === 'boolean') {
    normalized.isResolved = assetData.isResolved;
  }

  if (typeof assetData.archived === 'boolean') {
    normalized.archived = assetData.archived;
  }

  if (Number.isFinite(assetData.fileSize)) {
    normalized.fileSize = Math.trunc(assetData.fileSize);
  }

  const timestampFields = [
    'uploadedAt',
    'createdAt',
    'updatedAt',
    'lastUpdatedAt',
    'approvedAt',
    'archivedAt',
    'deliveredAt',
  ];
  for (const field of timestampFields) {
    const ts = normalizeTimestampValue(assetData[field]);
    if (ts !== null) {
      normalized[field] = ts;
    }
  }

  const tags = normalizeStringArray(assetData.tags);
  if (tags.length > 0) normalized.tags = tags;

  const keywords = normalizeStringArray(assetData.keywords);
  if (keywords.length > 0) normalized.keywords = keywords;

  if (Array.isArray(assetData.assets)) {
    const sanitizedAssets = assetData.assets
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const obj = {};
        for (const key of [
          'url',
          'downloadUrl',
          'assetUrl',
          'firebaseUrl',
          'sourceUrl',
          'thumbnailUrl',
          'aspectRatio',
          'type',
          'label',
          'variant',
        ]) {
          const value = normalizeStringValue(entry[key]);
          if (value) obj[key] = value;
        }
        if (Number.isFinite(entry.width)) obj.width = Math.trunc(entry.width);
        if (Number.isFinite(entry.height)) obj.height = Math.trunc(entry.height);
        if (Number.isFinite(entry.size)) obj.size = Math.trunc(entry.size);
        if (typeof entry.primary === 'boolean') obj.primary = entry.primary;
        return Object.keys(obj).length > 0 ? obj : null;
      })
      .filter(Boolean);
    if (sanitizedAssets.length > 0) normalized.assets = sanitizedAssets;
  }

  for (const key of [
    'compass',
    'adlog',
    'metadata',
    'details',
    'info',
    'fields',
    'partnerFields',
    'partnerData',
    'integration',
    'integrationData',
    'export',
    'exportData',
  ]) {
    if (Object.prototype.hasOwnProperty.call(assetData, key)) {
      const sanitized = sanitizeNestedValue(assetData[key]);
      if (sanitized === null) {
        normalized[key] = null;
      } else if (Array.isArray(sanitized)) {
        if (sanitized.length > 0) {
          normalized[key] = sanitized;
        }
      } else if (sanitized && typeof sanitized === 'object') {
        if (Object.keys(sanitized).length > 0) {
          normalized[key] = sanitized;
        }
      } else if (sanitized !== undefined) {
        normalized[key] = sanitized;
      }
    }
  }

  const groupSummary = {};
  const groupName = normalizeStringValue(groupData.name);
  if (groupName) groupSummary.name = groupName;
  const groupCode = normalizeStringValue(groupData.code);
  if (groupCode) groupSummary.code = groupCode;
  const groupBrandCode = normalizeStringValue(groupData.brandCode);
  if (groupBrandCode) groupSummary.brandCode = groupBrandCode;
  const projectId = normalizeStringValue(groupData.projectId);
  if (projectId) groupSummary.projectId = projectId;
  const requestId = normalizeStringValue(groupData.requestId);
  if (requestId) groupSummary.requestId = requestId;
  const brandId = normalizeStringValue(groupData.brandId);
  if (brandId) groupSummary.brandId = brandId;

  if (Object.keys(groupSummary).length > 0) {
    normalized.group = { id: groupId, ...groupSummary };
    if (groupSummary.name) normalized.groupName = groupSummary.name;
    if (groupSummary.projectId) normalized.projectId = groupSummary.projectId;
    if (groupSummary.requestId) normalized.requestId = groupSummary.requestId;
    if (groupSummary.brandId) normalized.brandId = groupSummary.brandId;
    if (!normalized.brandCode && groupSummary.brandCode) normalized.brandCode = groupSummary.brandCode;
    if (!normalized.adGroupCode && groupSummary.code) normalized.adGroupCode = groupSummary.code;
  }

  for (const key of Object.keys(normalized)) {
    const value = normalized[key];
    if (value === undefined) {
      delete normalized[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (Object.keys(value).length === 0) {
        delete normalized[key];
      }
    } else if (Array.isArray(value) && value.length === 0) {
      delete normalized[key];
    }
  }

  return normalized;
}

async function resolveBrandCodeForGroup(groupData = {}) {
  const takeFirstString = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed || '';
  };

  let resolved = '';

  const tryResolve = async (resolver) => {
    if (resolved) return;
    const value = await resolver();
    if (typeof value === 'string' && value.trim()) {
      resolved = value.trim();
    }
  };

  resolved = takeFirstString(groupData.brandCode);
  if (resolved) return resolved;

  if (groupData.brand && typeof groupData.brand === 'object') {
    resolved =
      takeFirstString(groupData.brand.code) || takeFirstString(groupData.brand.codeId);
    if (resolved) return resolved;
  }

  if (Array.isArray(groupData.brandCodes)) {
    for (const code of groupData.brandCodes) {
      const candidate = takeFirstString(code);
      if (candidate) return candidate;
    }
  }

  await tryResolve(async () => {
    const projectId = takeFirstString(groupData.projectId || '');
    if (!projectId) return '';
    try {
      const projectSnap = await db.collection('projects').doc(projectId).get();
      if (!projectSnap.exists) return '';
      const projectData = projectSnap.data() || {};
      return (
        takeFirstString(projectData.brandCode) ||
        (projectData.brand && typeof projectData.brand === 'object'
          ? takeFirstString(projectData.brand.code) || takeFirstString(projectData.brand.codeId)
          : '')
      );
    } catch (err) {
      console.error('Failed to load project while resolving brand code', projectId, err);
      return '';
    }
  });

  if (resolved) return resolved;

  await tryResolve(async () => {
    const requestId = takeFirstString(groupData.requestId || '');
    if (!requestId) return '';
    try {
      const requestSnap = await db.collection('requests').doc(requestId).get();
      if (!requestSnap.exists) return '';
      const requestData = requestSnap.data() || {};
      return (
        takeFirstString(requestData.brandCode) ||
        (requestData.brand && typeof requestData.brand === 'object'
          ? takeFirstString(requestData.brand.code) ||
            takeFirstString(requestData.brand.codeId)
          : '')
      );
    } catch (err) {
      console.error('Failed to load request while resolving brand code', requestId, err);
      return '';
    }
  });

  if (resolved) return resolved;

  await tryResolve(async () => {
    const brandId = takeFirstString(groupData.brandId || '');
    if (!brandId) return '';
    try {
      const brandSnap = await db.collection('brands').doc(brandId).get();
      if (!brandSnap.exists) return '';
      const brandData = brandSnap.data() || {};
      return takeFirstString(brandData.code) || takeFirstString(brandData.codeId);
    } catch (err) {
      console.error('Failed to load brand while resolving brand code', brandId, err);
      return '';
    }
  });

  return resolved;
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

export const mirrorAdAssets = onDocumentWritten(
  'adGroups/{groupId}/assets/{assetId}',
  async (event) => {
    const { groupId, assetId } = event.params;
    const assetRef = db.collection('adAssets').doc(assetId);

    const after = event.data?.after;
    if (!after || !after.exists) {
      try {
        await assetRef.delete();
      } catch (err) {
        const code = err?.code || err?.codeName;
        if (code !== 'not-found' && code !== 5) {
          console.error('Failed to delete mirrored ad asset', { assetId, groupId, error: err });
        }
      }
      return null;
    }

    const assetData = after.data() || {};
    let groupData = {};
    try {
      const groupSnap = await db.collection('adGroups').doc(groupId).get();
      if (groupSnap.exists) {
        groupData = groupSnap.data() || {};
      }
    } catch (err) {
      console.error('Failed to load ad group while mirroring asset', { groupId, assetId, error: err });
    }

    const normalized = buildNormalizedAssetDoc(assetId, groupId, assetData, groupData);
    normalized.syncedAt = admin.firestore.FieldValue.serverTimestamp();

    try {
      await assetRef.set(normalized, { merge: false });
    } catch (err) {
      console.error('Failed to write mirrored ad asset', { groupId, assetId, error: err });
    }

    return null;
  }
);

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

export const ensureAdGroupBrandCode = onDocumentWritten('adGroups/{groupId}', async (event) => {
  const afterSnap = event.data.after;
  if (!afterSnap?.exists) return null;

  const groupId = event.params.groupId;
  const beforeData = event.data.before?.data() || {};
  const afterData = afterSnap.data() || {};

  const beforeBrand = typeof beforeData.brandCode === 'string' ? beforeData.brandCode.trim() : '';
  const afterBrand = typeof afterData.brandCode === 'string' ? afterData.brandCode.trim() : '';

  if (afterBrand) return null;

  let resolvedBrandCode = '';
  try {
    resolvedBrandCode = await resolveBrandCodeForGroup(afterData);
  } catch (err) {
    console.error('Failed to resolve brand code for ad group', groupId, err);
    return null;
  }

  if (!resolvedBrandCode) {
    if (beforeBrand) {
      console.warn('Brand code removed from ad group without replacement', {
        adGroupId: groupId,
        previousBrandCode: beforeBrand,
      });
    } else {
      const status = typeof afterData.status === 'string' ? afterData.status.toLowerCase() : '';
      if (status && ['reviewed', 'designed'].includes(status)) {
        console.warn(
          `Skipping Slack notification for ${status} ad group ${groupId} because brand code is missing.`,
          { brandCode: null }
        );
      }
    }
    return null;
  }

  try {
    await afterSnap.ref.update({ brandCode: resolvedBrandCode });
    console.log('Backfilled brand code for ad group', {
      adGroupId: groupId,
      brandCode: resolvedBrandCode,
    });
  } catch (err) {
    console.error('Failed to backfill brand code for ad group', groupId, err);
  }

  return null;
});

function registerProcessUpload(handler) {
  const register = (options) =>
    options ? onObjectFinalized(options, handler) : onObjectFinalized(handler);

  try {
    if (defaultStorageBucket) {
      return register({ bucket: defaultStorageBucket });
    }
    return register();
  } catch (err) {
    if (!defaultStorageBucket && err?.message?.includes('Missing bucket name')) {
      console.warn(
        'Missing storage bucket configuration. Using a placeholder bucket for processUpload trigger registration.',
      );
      return register({ bucket: 'placeholder-bucket' });
    }
    throw err;
  }
}

async function processUploadHandler(event) {
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
}

export const processUpload = registerProcessUpload(processUploadHandler);

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

export { processExportJob, processExportJobCallable, runExportJob } from "./exportJobWorker.js";
