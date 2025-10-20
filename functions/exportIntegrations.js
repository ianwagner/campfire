import { URL } from 'url';
import admin from 'firebase-admin';
import { format as formatDate, isValid, parseISO } from 'date-fns';
import { getCampfireStandardFields } from './shared/integrationFieldDefinitions.js';

const EXPORTER_INTEGRATIONS_COLLECTION = 'settings';
const EXPORTER_INTEGRATIONS_DOC = 'exporterIntegrations';
const SETTINGS_CACHE_TTL_MS = 60 * 1000;

let cachedIntegrationSettings = null;
let cachedIntegrationFetchTime = 0;

function normalizeString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function normalizeHttpUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return '';
  }

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol.toLowerCase())) {
      return '';
    }
    return parsed.toString();
  } catch (err) {
    return '';
  }
}

const CAMPFIRE_FIELD_HINTS = (() => {
  const hints = new Set();
  getCampfireStandardFields().forEach((field) => {
    if (field?.key) {
      hints.add(field.key);
    }
  });
  return hints;
})();

function isCampfireFieldCandidate(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (CAMPFIRE_FIELD_HINTS.has(trimmed)) {
    return true;
  }
  if (trimmed.includes('.')) {
    return true;
  }
  if (/^image[_]?1x1(?:_[0-9]+)?$/i.test(trimmed)) {
    return true;
  }
  if (/^image[_]?9x16(?:_[0-9]+)?$/i.test(trimmed)) {
    return true;
  }
  if (/(Id|URL|Url|Code|Name|Number|Date)$/.test(trimmed)) {
    return true;
  }
  return false;
}

const RECIPE_NUMBER_KEY_ALIASES = new Set(['recipeno', 'recipeid']);
const GO_LIVE_DATE_KEY_ALIASES = new Set(['golivedate', 'launchdate', 'startdate', 'flightdate', 'golive']);
const ANGLE_KEY_ALIASES = new Set(['anglelabel', 'concept', 'conceptname', 'conceptid']);

function normalizeFieldMappingObject(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    return {};
  }

  const normalized = {};

  const entries = Object.entries(mapping)
    .map(([rawKey, rawValue]) => [
      typeof rawKey === 'string' ? rawKey.trim() : '',
      rawValue,
    ])
    .filter(([key]) => key);

  if (entries.length === 0) {
    return normalized;
  }

  const stringEntries = entries
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => ({
      key,
      value: value.trim(),
    }))
    .filter((entry) => entry.value);

  let keysAreCampfire = false;

  if (stringEntries.length > 0) {
    const keyCampfireMatches = stringEntries.filter(({ key }) => isCampfireFieldCandidate(key)).length;
    const valueCampfireMatches = stringEntries.filter(({ value }) => isCampfireFieldCandidate(value)).length;
    const hasKeyDot = stringEntries.some(({ key }) => key.includes('.'));
    const hasValueDot = stringEntries.some(({ value }) => value.includes('.'));

    if (hasKeyDot && !hasValueDot) {
      keysAreCampfire = true;
    } else if (hasValueDot && !hasKeyDot) {
      keysAreCampfire = false;
    } else if (valueCampfireMatches > keyCampfireMatches) {
      keysAreCampfire = false;
    } else if (keyCampfireMatches > 0) {
      keysAreCampfire = true;
    }
  }

  const assignEntry = (partnerField, sourceField, format) => {
    const partner = typeof partnerField === 'string' ? partnerField.trim() : '';
    const source = typeof sourceField === 'string' ? sourceField.trim() : '';
    const normalizedFormat = typeof format === 'string' ? format.trim() : '';
    if (!partner || !source) {
      return;
    }
    const entry = { source };
    if (normalizedFormat) {
      entry.format = normalizedFormat;
    }
    normalized[partner] = entry;
  };

  entries.forEach(([key, rawValue]) => {
    if (typeof rawValue === 'string') {
      const value = rawValue.trim();
      if (!value) {
        return;
      }
      if (keysAreCampfire) {
        assignEntry(value, key);
      } else {
        assignEntry(key, value);
      }
      return;
    }

    if (!rawValue || typeof rawValue !== 'object') {
      return;
    }

    const explicitSource =
      typeof rawValue.source === 'string' ? rawValue.source.trim() : '';
    const explicitPartner =
      typeof rawValue.target === 'string' ? rawValue.target.trim() : '';
    const partnerFallback =
      typeof rawValue.partner === 'string' ? rawValue.partner.trim() : '';
    const format =
      typeof rawValue.format === 'string' ? rawValue.format.trim() : '';

    if (explicitSource) {
      assignEntry(explicitPartner || partnerFallback || key, explicitSource, format);
      return;
    }

    const altSource =
      typeof rawValue.field === 'string'
        ? rawValue.field.trim()
        : typeof rawValue.campfire === 'string'
        ? rawValue.campfire.trim()
        : '';

    if (altSource) {
      assignEntry(explicitPartner || partnerFallback || key, altSource, format);
      return;
    }

    const altPartner =
      explicitPartner ||
      partnerFallback ||
      (typeof rawValue.partnerField === 'string'
        ? rawValue.partnerField.trim()
        : '');

    if (altPartner) {
      const inferredSource = keysAreCampfire ? key : '';
      assignEntry(altPartner, inferredSource || key, format);
      return;
    }

    if (keysAreCampfire) {
      const fallbackPartner =
        typeof rawValue.field === 'string'
          ? rawValue.field.trim()
          : typeof rawValue.targetField === 'string'
          ? rawValue.targetField.trim()
          : '';
      assignEntry(fallbackPartner || key, key, format);
    } else {
      const fallbackSource =
        typeof rawValue.field === 'string'
          ? rawValue.field.trim()
          : typeof rawValue.campfire === 'string'
          ? rawValue.campfire.trim()
          : '';
      assignEntry(key, fallbackSource || key, format);
    }
  });

  return normalized;
}

function normalizeIntegrationConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const partnerKeyRaw = typeof raw.partnerKey === 'string' ? raw.partnerKey.trim() : '';
  const fallbackKey = typeof raw.key === 'string' ? raw.key.trim() : '';
  const fallbackId = typeof raw.id === 'string' ? raw.id.trim() : '';
  const normalizedKey = normalizeString(partnerKeyRaw || fallbackKey || fallbackId).toLowerCase();

  if (!normalizedKey) {
    return null;
  }

  const displayName = typeof raw.name === 'string' ? raw.name.trim() : '';

  return {
    id: fallbackId || normalizedKey,
    key: normalizedKey,
    partnerKey: partnerKeyRaw || normalizedKey,
    name: displayName,
    label: displayName || partnerKeyRaw || normalizedKey,
    baseUrl: normalizeString(raw.baseUrl),
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    enabled: raw.enabled !== false,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    recipeTypeId: typeof raw.recipeTypeId === 'string' ? raw.recipeTypeId.trim() : '',
    fieldMapping: normalizeFieldMappingObject(raw.fieldMapping),
  };
}

async function fetchIntegrationSettings() {
  try {
    const db = admin.firestore();
    const docRef = db
      .collection(EXPORTER_INTEGRATIONS_COLLECTION)
      .doc(EXPORTER_INTEGRATIONS_DOC);
    const snap = await docRef.get();
    if (!snap.exists) {
      return [];
    }
    const data = snap.data() || {};
    const entries = Array.isArray(data.integrations) ? data.integrations : [];
    return entries
      .map((entry) => normalizeIntegrationConfig(entry))
      .filter((config) => config);
  } catch (err) {
    console.error('Failed to load exporter integrations from Firestore', err);
    return [];
  }
}

async function getCachedIntegrationSettings(force = false) {
  const now = Date.now();
  if (
    !force &&
    Array.isArray(cachedIntegrationSettings) &&
    now - cachedIntegrationFetchTime < SETTINGS_CACHE_TTL_MS
  ) {
    return cachedIntegrationSettings;
  }

  const settings = await fetchIntegrationSettings();
  cachedIntegrationSettings = settings;
  cachedIntegrationFetchTime = now;
  return settings;
}

async function findIntegrationConfig(key) {
  const normalizedKey = normalizeString(key).toLowerCase();
  if (!normalizedKey) {
    return null;
  }

  const settings = await getCachedIntegrationSettings();
  return (
    settings.find((config) => {
      if (!config) return false;
      if (config.key === normalizedKey) {
        return true;
      }
      const normalizedId = normalizeString(config.id).toLowerCase();
      if (normalizedId && normalizedId === normalizedKey) {
        return true;
      }
      const normalizedPartnerKey = normalizeString(config.partnerKey).toLowerCase();
      if (normalizedPartnerKey && normalizedPartnerKey === normalizedKey) {
        return true;
      }
      return false;
    }) || null
  );
}

function resolveValueByPath(source, segments) {
  if (!source || typeof source !== 'object' || !Array.isArray(segments) || segments.length === 0) {
    return undefined;
  }

  let current = source;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isInteger(index) && current[index] !== undefined) {
        current = current[index];
        continue;
      }
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function findDirectFieldValue(source, lowerKey) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  if (Array.isArray(source)) {
    return undefined;
  }

  const entries = source instanceof Map ? source.entries() : Object.entries(source);

  for (const [candidateKey, candidateValue] of entries) {
    if (typeof candidateKey === 'string' && candidateKey.toLowerCase() === lowerKey) {
      return candidateValue;
    }
  }

  return undefined;
}

function resolveValueForMappingKey(recipeField, context = {}) {
  const {
    adData = {},
    jobData = {},
    assetUrl = '',
    adId,
  } = context;
  const rawKey = typeof recipeField === 'string' ? recipeField.trim() : '';
  if (!rawKey) {
    return undefined;
  }

  const normalizedKey = normalizeKeyName(rawKey);
  const pathSegments = rawKey.includes('.')
    ? rawKey
        .split('.')
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [];

  const assetKeyInfo = parseAssetFieldKey(rawKey);
  const assetSlotIndex = assetKeyInfo && assetKeyInfo.hasIndex ? assetKeyInfo.index : 0;
  const baseAssetField = assetKeyInfo ? assetKeyInfo.baseKey : '';
  const isAssetField = baseAssetField === 'image_1x1' || baseAssetField === 'image_9x16';
  const assetAspectTargets =
    baseAssetField === 'image_9x16'
      ? ['9x16']
      : baseAssetField === 'image_1x1'
      ? ['1x1']
      : [];

  const normalizedAdId = normalizeString(adData?.id || adId);

  const overrideSources = [];
  if (normalizedAdId) {
    if (jobData.fieldOverrides && typeof jobData.fieldOverrides === 'object') {
      overrideSources.push(jobData.fieldOverrides[normalizedAdId]);
      if (adData?.id && adData.id !== normalizedAdId) {
        overrideSources.push(jobData.fieldOverrides[adData.id]);
      }
    }
    if (jobData.assetOverrides && typeof jobData.assetOverrides === 'object') {
      overrideSources.push(jobData.assetOverrides[normalizedAdId]);
      if (adData?.id && adData.id !== normalizedAdId) {
        overrideSources.push(jobData.assetOverrides[adData.id]);
      }
    }
  }

  const adSources = [
    adData,
    adData.partnerFields,
    adData.partnerData,
    adData.recipe,
    adData.recipeData,
    adData.recipeFields,
    adData.recipe?.fields,
    adData.integration,
    adData.integrationData,
    adData.export,
    adData.exportData,
    adData.metadata,
    adData.meta,
    adData.details,
    adData.info,
    adData.fields,
  ];

  const jobSources = [
    jobData.partnerFields,
    jobData.partnerData,
    jobData.recipe,
    jobData.recipeData,
    jobData.recipeFields,
    jobData.integration,
    jobData.integrationData,
    jobData.export,
    jobData.exportData,
    jobData.metadata,
    jobData.meta,
    jobData.details,
    jobData.info,
    jobData.fields,
    jobData.group,
    jobData.groupData,
    jobData.brand,
    jobData,
  ];

  const sourcesByPriority = [overrideSources, adSources, jobSources];

  const tryResolveAssetOverride = () => {
    if (!isAssetField) {
      return '';
    }
    for (const overrideSource of overrideSources) {
      if (!overrideSource) {
        continue;
      }
      const overrideValue = resolveAssetOverrideValue(overrideSource, {
        rawKey,
        baseKey: baseAssetField,
        slotIndex: assetSlotIndex,
        aspectTargets: assetAspectTargets,
      });
      if (overrideValue) {
        return overrideValue;
      }
    }
    return '';
  };

  if (isAssetField) {
    const overrideValue = tryResolveAssetOverride();
    if (overrideValue) {
      return overrideValue;
    }
  }

  if (pathSegments.length > 1) {
    const adValue = resolveValueByPath(adData, pathSegments);
    const adExtracted = extractPrimitiveValue(adValue);
    if (adExtracted !== undefined) {
      return adExtracted;
    }

    const jobValue = resolveValueByPath(jobData, pathSegments);
    const jobExtracted = extractPrimitiveValue(jobValue);
    if (jobExtracted !== undefined) {
      return jobExtracted;
    }
  }

  if (normalizedKey) {
    const lowerKey = rawKey.toLowerCase();
    for (const sourceGroup of sourcesByPriority) {
      for (const source of sourceGroup) {
        if (!source) {
          continue;
        }
        const directValue = findDirectFieldValue(source, lowerKey);
        if (directValue === undefined) {
          continue;
        }
        const extracted = extractPrimitiveValue(directValue);
        if (extracted !== undefined) {
          return extracted;
        }
      }
    }
  }

  if (normalizedKey === 'asseturl') {
    const explicitAsset = normalizeString(assetUrl);
    if (explicitAsset) {
      return explicitAsset;
    }
    const resolvedAsset = resolveAssetUrl(adData);
    return resolvedAsset || undefined;
  }

  if (isAssetField) {
    const assetFromAd =
      assetKeyInfo && assetKeyInfo.hasIndex
        ? extractAssetUrlByAspectIndex(adData.assets, assetAspectTargets, assetSlotIndex)
        : extractAssetUrlByAspect(adData.assets, assetAspectTargets);
    if (assetFromAd) {
      return assetFromAd;
    }
  }

  return undefined;
}

function coerceDate(value) {
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return isValid(fromNumber) ? fromNumber : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsedIso = parseISO(trimmed);
    if (isValid(parsedIso)) {
      return parsedIso;
    }
    const parsed = new Date(trimmed);
    return isValid(parsed) ? parsed : null;
  }

  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        const converted = value.toDate();
        if (converted instanceof Date && isValid(converted)) {
          return converted;
        }
      } catch (err) {
        return null;
      }
    }
  }

  return null;
}

function buildPayloadFromMapping({
  fieldMapping = {},
  adData = {},
  jobData = {},
  assetUrl = '',
  integrationKey = '',
  adId,
}) {
  const entries = Object.entries(fieldMapping);
  const payload = {};
  const missingFields = [];

  for (const [partnerField, mappingValue] of entries) {
    const partnerKeyRaw = typeof partnerField === 'string' ? partnerField.trim() : '';
    if (!partnerKeyRaw) {
      continue;
    }

    let sourceField = '';
    let formatOverride = '';

    if (typeof mappingValue === 'string') {
      sourceField = mappingValue.trim();
    } else if (mappingValue && typeof mappingValue === 'object') {
      if (typeof mappingValue.source === 'string') {
        sourceField = mappingValue.source.trim();
      } else if (typeof mappingValue.field === 'string') {
        sourceField = mappingValue.field.trim();
      } else if (typeof mappingValue.campfire === 'string') {
        sourceField = mappingValue.campfire.trim();
      }
      if (typeof mappingValue.format === 'string') {
        formatOverride = mappingValue.format.trim();
      }
    }

    if (!sourceField) {
      continue;
    }

    const lowerPartnerField = partnerKeyRaw.toLowerCase();
    const assetInfo = parseAssetFieldKey(partnerKeyRaw);
    const basePartnerField = assetInfo ? assetInfo.baseKey : lowerPartnerField;
    const normalizedPartnerKey = normalizeKeyName(partnerKeyRaw);
    const normalizedBasePartnerKey = normalizeKeyName(basePartnerField);
    const isPartnerAssetField = !!assetInfo;

    const value = resolveValueForMappingKey(sourceField, {
      adData,
      jobData,
      assetUrl,
      adId,
    });

    let finalValue = value;

    if (formatOverride) {
      const parsedDate = coerceDate(value);
      if (parsedDate) {
        try {
          finalValue = formatDate(parsedDate, formatOverride);
        } catch (err) {
          finalValue = undefined;
        }
      } else {
        finalValue = undefined;
      }
    }

    const matchesRecipeNumber =
      lowerPartnerField === 'recipe_no' ||
      RECIPE_NUMBER_KEY_ALIASES.has(normalizedPartnerKey) ||
      RECIPE_NUMBER_KEY_ALIASES.has(normalizedBasePartnerKey);

    const matchesGoLiveDate =
      lowerPartnerField === 'go_live_date' ||
      GO_LIVE_DATE_KEY_ALIASES.has(normalizedPartnerKey) ||
      GO_LIVE_DATE_KEY_ALIASES.has(normalizedBasePartnerKey);

    const matchesAngleField =
      lowerPartnerField === 'angle' ||
      (normalizedPartnerKey && normalizedPartnerKey.startsWith('angle')) ||
      (normalizedBasePartnerKey && normalizedBasePartnerKey.startsWith('angle')) ||
      ANGLE_KEY_ALIASES.has(normalizedPartnerKey) ||
      ANGLE_KEY_ALIASES.has(normalizedBasePartnerKey);

    if (matchesRecipeNumber) {
      if (finalValue !== undefined && finalValue !== null && finalValue !== '') {
        const normalized = normalizeRecipeNumber(finalValue);
        if (!normalized.error) {
          finalValue = normalized.value;
        } else {
          finalValue = undefined;
        }
      }
    } else if (!formatOverride && matchesGoLiveDate) {
      finalValue = formatDateString(finalValue);
      if (!finalValue) {
        finalValue = undefined;
      }
    } else if (matchesAngleField) {
      finalValue = normalizeAngleValue(finalValue);
      if (finalValue === '') {
        finalValue = undefined;
      }
    } else if (isPartnerAssetField) {
      const candidate = normalizeString(finalValue);
      if (candidate) {
        const { valid, url } = validateAssetUrl(candidate);
        finalValue = valid ? url : undefined;
      } else {
        finalValue = undefined;
      }
    }

    if (finalValue === undefined || finalValue === null || finalValue === '') {
      missingFields.push(partnerKeyRaw);
      continue;
    }

    payload[partnerKeyRaw] = finalValue;
  }

  if (missingFields.length > 0) {
    const error = new Error(`Missing mapped fields: ${missingFields.join(', ')}`);
    error.code = 'missing-mapped-fields';
    error.metadata = { missingFields, integrationKey };
    throw error;
  }

  return payload;
}

function buildHeadersForConfig(config = {}) {
  const headers = {};
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
    headers['x-api-key'] = config.apiKey;
  }
  return headers;
}

export function resolveAssetUrl(adData = {}) {
  const candidates = [
    adData.exportUrl,
    adData.assetUrl,
    adData.firebaseUrl,
    adData.adUrl,
    adData.url,
    adData.sourceUrl,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  if (Array.isArray(adData.assets)) {
    for (const asset of adData.assets) {
      const normalized = normalizeString(asset?.url || asset?.downloadUrl || asset?.assetUrl);
      if (normalized) {
        return normalized;
      }
    }
  }

  return '';
}

function looksLikeFolderPath(pathname = '') {
  if (!pathname) return true;
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed) return true;
  return false;
}

function hasFileLikeSegment(pathname = '', searchParams = new URLSearchParams()) {
  const trimmed = pathname.replace(/\/+$/, '');
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length === 0) {
    return ['alt', 'token', 'download', 'media', 'id'].some((key) => searchParams.has(key));
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment.includes('.')) {
    return true;
  }

  return ['alt', 'token', 'download', 'media', 'id'].some((key) => searchParams.has(key));
}

function isDisallowedDriveUrl(url) {
  const host = url.hostname.toLowerCase();
  if (!host.includes('drive.google.com')) {
    return false;
  }
  const pathname = url.pathname.toLowerCase();
  if (pathname.includes('/folders/')) {
    return true;
  }
  if (pathname.endsWith('/folderview')) {
    return true;
  }
  if (pathname.includes('/file/d/')) {
    const exportParam = (url.searchParams.get('export') || '').toLowerCase();
    if (exportParam !== 'download') {
      return true;
    }
  }
  return false;
}

export function validateAssetUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return { valid: false, reason: 'Missing asset URL', url: '' };
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (err) {
    return { valid: false, reason: 'Invalid asset URL.', url: normalized };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!['http:', 'https:'].includes(protocol)) {
    return { valid: false, reason: 'Invalid asset URL.', url: normalized };
  }

  if (isDisallowedDriveUrl(parsed)) {
    return { valid: false, reason: 'Invalid asset URL.', url: normalized };
  }

  if (!hasFileLikeSegment(parsed.pathname, parsed.searchParams) || looksLikeFolderPath(parsed.pathname)) {
    return { valid: false, reason: 'Invalid asset URL.', url: normalized };
  }

  return { valid: true, reason: '', url: normalized };
}

function extractPrimitiveValue(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) {
      return value;
    }
    return undefined;
  }

  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) {
      return date;
    }
  }

  if (value && typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    if (Number.isFinite(millis)) {
      const date = new Date(millis);
      if (Number.isFinite(date.getTime())) {
        return date;
      }
    }
  }

  if (value && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    const millis = value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
    if (Number.isFinite(millis)) {
      const date = new Date(millis);
      if (Number.isFinite(date.getTime())) {
        return date;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractPrimitiveValue(item);
      if (extracted !== undefined) {
        return extracted;
      }
    }
    return undefined;
  }

  if (typeof value === 'object') {
    const preferredKeys = [
      'value',
      'name',
      'label',
      'text',
      'title',
      'display',
      'displayValue',
      'id',
      'url',
      'href',
      'link',
    ];

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const extracted = extractPrimitiveValue(value[key]);
        if (extracted !== undefined) {
          return extracted;
        }
      }
    }
  }

  return undefined;
}

function normalizeAspectKey(value) {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  if (!raw) return '';

  if (/1\s*[x:\/\-]\s*1/.test(raw) || /square/.test(raw)) {
    return '1x1';
  }

  if (/9\s*[x:\/\-]\s*16/.test(raw)) {
    return '9x16';
  }

  if (/story/.test(raw) || /vertical/.test(raw) || /reel/.test(raw)) {
    return '9x16';
  }

  if (/feed/.test(raw) || /square/.test(raw)) {
    return '1x1';
  }

  const sizeMatch = raw.match(/(\d+)\s*[x\-]\s*(\d+)/);
  if (sizeMatch) {
    const width = parseInt(sizeMatch[1], 10);
    const height = parseInt(sizeMatch[2], 10);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      const ratio = width / height;
      if (Math.abs(ratio - 1) <= 0.05) {
        return '1x1';
      }
      const nineSixteen = 9 / 16;
      if (Math.abs(ratio - nineSixteen) <= 0.05 || Math.abs((1 / ratio) - (16 / 9)) <= 0.05) {
        return '9x16';
      }
    }
  }

  return '';
}

function extractAssetUrlFromCandidate(candidate, slotIndex = 0) {
  if (!candidate) {
    return '';
  }

  if (typeof candidate === 'string') {
    return normalizeString(candidate);
  }

  if (Array.isArray(candidate)) {
    if (candidate.length === 0) {
      return '';
    }

    if (slotIndex >= 0 && slotIndex < candidate.length) {
      const direct = extractAssetUrlFromCandidate(candidate[slotIndex], 0);
      if (direct) {
        return direct;
      }
    }

    for (const item of candidate) {
      const extracted = extractAssetUrlFromCandidate(item, 0);
      if (extracted) {
        return extracted;
      }
    }

    return '';
  }

  if (typeof candidate === 'object') {
    const prioritizedKeys = [
      'url',
      'downloadUrl',
      'assetUrl',
      'firebaseUrl',
      'imageUrl',
      'mediaUrl',
      'sourceUrl',
      'src',
      'href',
      'link',
      'fileUrl',
      'publicUrl',
      'permalink',
      'previewUrl',
      'thumbnailUrl',
      'value',
      'variants',
      'images',
      'files',
      'creative',
      'asset',
    ];

    for (const key of prioritizedKeys) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        const extracted = extractAssetUrlFromCandidate(candidate[key], 0);
        if (extracted) {
          return extracted;
        }
      }
    }

    return '';
  }

  return '';
}

function getAssetOrderWeight(asset, fallbackIndex = 0) {
  if (!asset || typeof asset !== 'object') {
    return fallbackIndex;
  }

  const numericCandidates = [
    asset.carouselIndex,
    asset.carouselPosition,
    asset.position,
    asset.order,
    asset.sequence,
    asset.sequenceIndex,
    asset.rank,
    asset.priority,
    asset.index,
  ];

  for (const candidate of numericCandidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallbackIndex;
}

function collectAssetsByAspect(assets = [], aspectTargets = []) {
  if (!Array.isArray(assets)) {
    return [];
  }

  const normalizedTargets = aspectTargets.map((aspect) => normalizeAspectKey(aspect)).filter(Boolean);
  if (normalizedTargets.length === 0) {
    return [];
  }

  const matches = [];

  assets.forEach((asset, index) => {
    if (!asset || typeof asset !== 'object') {
      return;
    }

    const aspectCandidates = [
      asset.aspectRatio,
      asset.aspect,
      asset.ratio,
      asset.format,
      asset.dimensions,
      asset.metadata?.aspectRatio,
      asset.meta?.aspectRatio,
      asset.meta?.ratio,
    ];

    if (asset.filename) {
      const fileMatch = asset.filename.match(/(\d+)[xX](\d+)/);
      if (fileMatch) {
        aspectCandidates.push(`${fileMatch[1]}x${fileMatch[2]}`);
      }
      if (/1x1/i.test(asset.filename)) {
        aspectCandidates.push('1x1');
      }
      if (/9x16/i.test(asset.filename)) {
        aspectCandidates.push('9x16');
      }
    }

    if (Array.isArray(asset.labels)) {
      asset.labels.forEach((label) => aspectCandidates.push(label));
    }

    if (Array.isArray(asset.tags)) {
      asset.tags.forEach((tag) => aspectCandidates.push(tag));
    }

    const normalizedAspectCandidates = aspectCandidates
      .map((value) => normalizeAspectKey(value))
      .filter(Boolean);

    if (!normalizedAspectCandidates.some((value) => normalizedTargets.includes(value))) {
      return;
    }

    const url = extractAssetUrlFromCandidate(asset);
    if (!url) {
      return;
    }

    const { valid, url: normalizedUrl } = validateAssetUrl(url);
    if (!valid || !normalizedUrl) {
      return;
    }

    matches.push({ url: normalizedUrl, asset, index });
  });

  matches.sort((a, b) => getAssetOrderWeight(a.asset, a.index) - getAssetOrderWeight(b.asset, b.index));

  return matches;
}

function extractAssetUrlByAspect(assets = [], aspectTargets = []) {
  const matches = collectAssetsByAspect(assets, aspectTargets);
  if (matches.length === 0) {
    return '';
  }
  return matches[0].url;
}

function extractAssetUrlByAspectIndex(assets = [], aspectTargets = [], index = 0) {
  const matches = collectAssetsByAspect(assets, aspectTargets);
  if (matches.length === 0) {
    return '';
  }
  const clampedIndex = Math.min(Math.max(0, index), matches.length - 1);
  return matches[clampedIndex].url;
}

function resolveAssetOverrideValue(
  overrideEntry,
  { rawKey = '', baseKey = '', slotIndex = 0, aspectTargets = [] } = {},
) {
  if (!overrideEntry) {
    return '';
  }

  if (typeof overrideEntry === 'string' || Array.isArray(overrideEntry)) {
    return extractAssetUrlFromCandidate(overrideEntry, slotIndex);
  }

  if (typeof overrideEntry !== 'object') {
    return '';
  }

  const candidateKeys = [];

  if (rawKey) {
    candidateKeys.push(rawKey);
  }

  if (baseKey) {
    const sanitizedBase = baseKey.replace(/\s+/g, '');
    const suffix = slotIndex >= 0 ? `_${slotIndex + 1}` : '';
    const simpleSuffix = slotIndex >= 0 ? String(slotIndex + 1) : '';

    if (suffix) {
      candidateKeys.push(`${baseKey}${suffix}`);
      candidateKeys.push(`${sanitizedBase}${suffix}`);
      candidateKeys.push(`${baseKey}${simpleSuffix}`);
      candidateKeys.push(`${sanitizedBase}${simpleSuffix}`);
    }

    candidateKeys.push(baseKey);
    candidateKeys.push(sanitizedBase);
  }

  if (slotIndex === 0) {
    candidateKeys.push('assetUrl');
  }

  candidateKeys.push('assetUrls');

  for (const key of candidateKeys) {
    if (!key) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(overrideEntry, key)) {
      const extracted = extractAssetUrlFromCandidate(overrideEntry[key], slotIndex);
      if (extracted) {
        return extracted;
      }
    }
  }

  if (Array.isArray(overrideEntry.assets)) {
    const overrideAsset = extractAssetUrlByAspectIndex(
      overrideEntry.assets,
      aspectTargets,
      slotIndex,
    );
    if (overrideAsset) {
      return overrideAsset;
    }
  }

  const nestedKeys = ['asset', 'creative', 'image'];
  for (const nestedKey of nestedKeys) {
    if (Object.prototype.hasOwnProperty.call(overrideEntry, nestedKey)) {
      const extracted = extractAssetUrlFromCandidate(overrideEntry[nestedKey], slotIndex);
      if (extracted) {
        return extracted;
      }
    }
  }

  return '';
}

function formatDateString(value) {
  if (!value) return '';

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return '';
    }
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return '';
}

function normalizeAngleValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 1 && value <= 32) {
      return Math.trunc(value);
    }
    return String(value);
  }

  const stringValue = normalizeString(value);
  if (!stringValue) {
    return '';
  }

  const numericMatch = stringValue.match(/^(\d{1,2})$/);
  if (numericMatch) {
    const numericValue = parseInt(numericMatch[1], 10);
    if (numericValue >= 1 && numericValue <= 32) {
      return numericValue;
    }
  }

  return stringValue;
}

function normalizeRecipeNumber(value) {
  if (value === null || value === undefined) {
    return { value: undefined, error: 'Missing recipe_no' };
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value !== 0) {
      return { value: Math.trunc(value), error: '' };
    }
    return { value: undefined, error: 'Invalid recipe_no' };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { value: undefined, error: 'Missing recipe_no' };
    }
    if (!/^[-+]?\d+$/.test(trimmed)) {
      return { value: undefined, error: 'Invalid recipe_no' };
    }
    const parsed = parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed === 0) {
      return { value: undefined, error: 'Invalid recipe_no' };
    }
    return { value: parsed, error: '' };
  }

  return { value: undefined, error: 'Invalid recipe_no' };
}

function buildIntegrationFromConfig(config) {
  if (!config || !config.key) {
    return null;
  }

  const normalizedKey = config.key;
  const fieldMapping = config.fieldMapping && typeof config.fieldMapping === 'object'
    ? config.fieldMapping
    : {};

  const integration = {
    key: normalizedKey,
    label: config.label || config.partnerKey || normalizedKey,
    requiredFields: Array.isArray(config.requiredFields) ? [...config.requiredFields] : [],
  };

  integration.partnerKey = config.partnerKey || normalizedKey;
  integration.label = config.label || integration.label || integration.partnerKey;
  integration.recipeTypeId = typeof config.recipeTypeId === 'string' ? config.recipeTypeId : '';
  integration.fieldMapping = fieldMapping;
  integration.config = config;

  const configuredEndpoint = normalizeHttpUrl(config.baseUrl) || normalizeString(config.baseUrl);
  if (configuredEndpoint) {
    integration.endpoint = configuredEndpoint;
    integration.getEndpoint = () => configuredEndpoint;
  }

  const headers = buildHeadersForConfig(config);
  if (Object.keys(headers).length > 0) {
    integration.buildHeaders = () => ({ ...headers });
  }

  if (Object.keys(fieldMapping).length > 0) {
    integration.buildPayload = async ({
      adData = {},
      jobData = {},
      assetUrl = '',
      jobId,
    }) =>
      buildPayloadFromMapping({
        fieldMapping,
        adData,
        jobData,
        assetUrl,
        integrationKey: normalizedKey,
        adId: adData?.id || jobId,
      });
  }

  return integration;
}

export async function getIntegration(key) {
  const normalized = normalizeString(key).toLowerCase();
  if (!normalized) return null;

  try {
    const config = await findIntegrationConfig(normalized);
    if (config) {
      if (config.enabled === false) {
        console.warn('Requested integration is disabled in settings', { integrationKey: normalized });
        return null;
      }
      const dynamicIntegration = buildIntegrationFromConfig(config);
      if (dynamicIntegration) {
        return dynamicIntegration;
      }
    }
  } catch (err) {
    console.error('Failed to resolve integration from Firestore settings', err);
  }

  return null;
}

export async function listIntegrations() {
  const seen = new Set();
  const entries = [];

  try {
    const dynamicConfigs = await getCachedIntegrationSettings();
    dynamicConfigs
      .filter((config) => config.enabled !== false)
      .forEach((config) => {
        if (seen.has(config.key)) {
          return;
        }
        seen.add(config.key);
        entries.push({
          key: config.key,
          label: config.label || config.partnerKey || config.key,
        });
      });
  } catch (err) {
    console.error('Failed to list exporter integrations from settings', err);
  }

  return entries;
}

export function __resetIntegrationCache() {
  cachedIntegrationSettings = null;
  cachedIntegrationFetchTime = 0;
}
