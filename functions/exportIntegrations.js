import { URL } from 'url';
import admin from 'firebase-admin';

const DEFAULT_COMPASS_EXPORT_ENDPOINT =
  'https://api.compass.statlas.io/compass/RA9cCzM5Ux';

const COMPASS_INTEGRATION_KEY = 'compass';

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

function normalizeFieldMappingObject(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    return {};
  }

  const normalized = {};

  Object.entries(mapping).forEach(([recipeField, partnerField]) => {
    const key = typeof recipeField === 'string' ? recipeField.trim() : '';
    const value = typeof partnerField === 'string' ? partnerField.trim() : '';
    if (!key || !value) {
      return;
    }
    normalized[key] = value;
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
  return settings.find((config) => config.key === normalizedKey) || null;
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

  const assetKeyInfo = parseCompassAssetKey(rawKey);
  const assetSlotIndex = assetKeyInfo && assetKeyInfo.hasIndex ? assetKeyInfo.index : 0;
  const baseCompassField = assetKeyInfo ? assetKeyInfo.baseKey : '';
  const isAssetField = baseCompassField === 'image_1x1' || baseCompassField === 'image_9x16';
  const assetAspectTargets =
    baseCompassField === 'image_9x16'
      ? ['9x16']
      : baseCompassField === 'image_1x1'
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
    if (jobData.compassOverrides && typeof jobData.compassOverrides === 'object') {
      overrideSources.push(jobData.compassOverrides[normalizedAdId]);
      if (adData?.id && adData.id !== normalizedAdId) {
        overrideSources.push(jobData.compassOverrides[adData.id]);
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
    adData.compass,
    adData.adlog,
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
    jobData.compass,
    jobData.adlog,
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
        baseKey: baseCompassField,
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

  for (const [recipeField, partnerField] of entries) {
    const recipeKey = typeof recipeField === 'string' ? recipeField.trim() : '';
    const partnerKey = typeof partnerField === 'string' ? partnerField.trim() : '';
    if (!recipeKey || !partnerKey) {
      continue;
    }

    const partnerBaseField =
      integrationKey === COMPASS_INTEGRATION_KEY
        ? normalizeCompassFieldName(partnerKey)
        : '';
    const isPartnerAssetField =
      partnerBaseField === 'image_1x1' || partnerBaseField === 'image_9x16';

    const value = resolveValueForMappingKey(recipeKey, {
      adData,
      jobData,
      assetUrl,
      adId,
    });

    let finalValue = value;
    const normalizedPartnerKey = normalizeKeyName(partnerKey);

    if (integrationKey === COMPASS_INTEGRATION_KEY) {
      if (partnerBaseField === 'recipe_no' || normalizedPartnerKey === 'recipeno') {
        if (finalValue !== undefined && finalValue !== null && finalValue !== '') {
          const normalized = normalizeRecipeNumber(finalValue);
          if (!normalized.error) {
            finalValue = normalized.value;
          } else {
            finalValue = undefined;
          }
        }
      } else if (partnerBaseField === 'go_live_date' || normalizedPartnerKey === 'golivedate') {
        finalValue = formatDateString(finalValue);
        if (!finalValue) {
          finalValue = undefined;
        }
      } else if (partnerBaseField === 'angle' || normalizedPartnerKey === 'angle') {
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
    }

    if (finalValue === undefined || finalValue === null || finalValue === '') {
      missingFields.push(recipeKey);
      continue;
    }

    payload[partnerKey] = finalValue;
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

function resolveCompassEndpointFromDestinations(destinations = [], targetKey = '') {
  const normalizedTargetKey = normalizeString(targetKey).toLowerCase();
  const aliasKeys = ['compass', 'adlog'];

  function keyMatches(candidate) {
    const normalized = normalizeString(candidate).toLowerCase();
    if (!normalized) {
      return false;
    }
    if (aliasKeys.includes(normalized)) {
      return true;
    }
    if (normalizedTargetKey && normalized === normalizedTargetKey) {
      return true;
    }
    return false;
  }

  const queue = [];
  const visited = new Set();

  function enqueue(value, metaKey = '') {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'object' && value !== null) {
      if (visited.has(value)) {
        return;
      }
      visited.add(value);
    }
    queue.push({ value, metaKey });
  }

  enqueue(destinations, '');

  while (queue.length > 0) {
    const { value, metaKey } = queue.shift();

    if (typeof value === 'string') {
      const normalized = normalizeHttpUrl(value);
      if (!normalized) {
        continue;
      }
      if (
        !normalizedTargetKey ||
        aliasKeys.includes(normalizedTargetKey) ||
        keyMatches(metaKey)
      ) {
        return normalized;
      }
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        enqueue(entry, metaKey);
      }
      continue;
    }

    if (typeof value !== 'object' || value === null) {
      continue;
    }

    const candidateKeys = [
      value.key,
      value.integration,
      value.integrationKey,
      value.partner,
      value.partnerKey,
      value.provider,
      value.id,
      value.name,
      value.type,
      metaKey,
    ];

    const matchesCompass = candidateKeys.some((candidate) => keyMatches(candidate));

    if (matchesCompass) {
      const candidateValues = [
        value.endpoint,
        value.url,
        value.webhookUrl,
        value.partnerEndpoint,
        value.partnerUrl,
        value.partnerWebhook,
        value.config && value.config.endpoint,
        value.config && value.config.url,
        value.value,
      ];

      for (const candidateValue of candidateValues) {
        const normalized = normalizeHttpUrl(candidateValue);
        if (normalized) {
          return normalized;
        }
      }
    }

    for (const [childKey, childValue] of Object.entries(value)) {
      if (
        childValue === undefined ||
        childValue === null ||
        (typeof childValue === 'string' &&
          ['endpoint', 'url', 'webhookUrl', 'partnerEndpoint', 'partnerUrl', 'partnerWebhook'].includes(childKey))
      ) {
        continue;
      }

      if (typeof childValue === 'object' || Array.isArray(childValue) || typeof childValue === 'string') {
        enqueue(childValue, childKey);
      }
    }
  }

  return '';
}

function resolveCompassEndpointFromJobData(jobData = {}) {
  if (!jobData || typeof jobData !== 'object') {
    return '';
  }

  const targetKey =
    jobData.targetIntegration ||
    jobData.integrationKey ||
    (jobData.integration && (jobData.integration.key || jobData.integration.integrationKey)) ||
    jobData.partnerKey ||
    (jobData.partner && (jobData.partner.key || jobData.partner.integrationKey)) ||
    '';

  const directCandidates = [
    jobData.endpoint,
    jobData.integrationEndpoint,
    jobData.integrationUrl,
    jobData.destinationUrl,
    jobData.webhookUrl,
    jobData.partnerEndpoint,
    jobData.partnerUrl,
    jobData.partnerWebhook,
  ];

  for (const value of directCandidates) {
    const normalized = normalizeHttpUrl(value);
    if (normalized) {
      return normalized;
    }
  }

  const nestedSources = [
    jobData.integration,
    jobData.partner,
    jobData.partnerData,
    jobData.destination,
    jobData.compass,
    jobData.export,
    jobData.exportData,
  ];

  for (const source of nestedSources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    const candidateValues = [
      source.endpoint,
      source.url,
      source.webhookUrl,
      source.config && source.config.endpoint,
      source.config && source.config.url,
    ];

    for (const value of candidateValues) {
      const normalized = normalizeHttpUrl(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  const destinationEndpoint = resolveCompassEndpointFromDestinations(jobData.destinations, targetKey);
  if (destinationEndpoint) {
    return destinationEndpoint;
  }

  const partnerDestinationEndpoint = resolveCompassEndpointFromDestinations(
    jobData.partnerDestinations,
    targetKey,
  );
  if (partnerDestinationEndpoint) {
    return partnerDestinationEndpoint;
  }

  const partnersEndpoint = resolveCompassEndpointFromDestinations(jobData.partners, targetKey);
  if (partnersEndpoint) {
    return partnersEndpoint;
  }

  return '';
}

const COMPASS_REQUIRED_FIELDS = [
  'shop',
  'group_desc',
  'recipe_no',
  'product',
  'product_url',
  'go_live_date',
  'funnel',
  'angle',
  'persona',
  'primary_text',
  'headline',
  'image_1x1',
  'image_9x16',
];

const COMPASS_OPTIONAL_FIELDS = ['moment', 'description', 'status'];

const COMPASS_ALL_FIELDS = [...new Set([...COMPASS_REQUIRED_FIELDS, ...COMPASS_OPTIONAL_FIELDS])];

const COMPASS_FIELD_LABELS = {
  shop: 'shop',
  group_desc: 'group_desc',
  recipe_no: 'recipe_no',
  product: 'product',
  product_url: 'product_url',
  go_live_date: 'go_live_date',
  funnel: 'funnel',
  angle: 'angle',
  persona: 'persona',
  primary_text: 'primary_text',
  headline: 'headline',
  image_1x1: 'image_1x1',
  image_9x16: 'image_9x16',
  moment: 'moment',
  description: 'description',
  status: 'status',
};

const COMPASS_FIELD_SYNONYMS = {
  shop: [
    'shop',
    'shop_id',
    'shopId',
    'store',
    'store_id',
    'storeId',
    'brand',
    'brand_code',
    'brandCode',
    'brandId',
  ],
  group_desc: [
    'group_desc',
    'groupDesc',
    'group_description',
    'groupDescription',
    'group',
    'groupName',
    'ad_group',
    'adGroup',
    'adGroupName',
    'campaign',
    'campaignName',
    'campaign_group',
    'campaignGroup',
  ],
  recipe_no: [
    'recipe_no',
    'recipeNo',
    'recipe',
    'recipe_number',
    'recipeNumber',
    'recipeId',
    'recipe_id',
    'build',
    'buildId',
    'build_id',
    'buildNumber',
    'version',
  ],
  product: ['product', 'productName', 'product_name', 'name', 'title', 'sku'],
  product_url: [
    'product_url',
    'productUrl',
    'product_link',
    'productLink',
    'landing_page',
    'landingPage',
    'landingPageUrl',
    'landing_page_url',
    'url',
    'link',
  ],
  go_live_date: [
    'go_live_date',
    'goLiveDate',
    'launch_date',
    'launchDate',
    'start_date',
    'startDate',
    'flightDate',
    'flight_date',
    'goLive',
    'go_live',
  ],
  funnel: ['funnel', 'funnelStage', 'funnel_stage', 'stage'],
  angle: ['angle', 'angleId', 'angle_id', 'angleName', 'concept', 'conceptName', 'angleLabel'],
  persona: ['persona', 'personaName', 'audience', 'audienceName', 'audience_label'],
  primary_text: [
    'primary_text',
    'primaryText',
    'body',
    'bodyCopy',
    'body_copy',
    'copy',
    'copyPrimary',
    'text',
    'copyText',
  ],
  headline: ['headline', 'headlineText', 'headline_text', 'title', 'heading'],
  image_1x1: [
    'image_1x1',
    'image1x1',
    'imageSquare',
    'squareImage',
    'asset1x1',
    'asset_1x1',
    'creative1x1',
    'squareAsset',
  ],
  image_9x16: [
    'image_9x16',
    'image9x16',
    'verticalImage',
    'storyImage',
    'asset9x16',
    'asset_9x16',
    'creative9x16',
    'verticalAsset',
  ],
  moment: ['moment', 'campaignMoment', 'theme', 'campaignTheme'],
  description: ['description', 'notes', 'note', 'summary', 'comment'],
  status: ['status', 'state', 'workflowStatus', 'workflow_state', 'workflow'],
};

function normalizeKeyName(name = '') {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseCompassAssetKey(rawKey = '') {
  if (!rawKey) {
    return null;
  }

  const trimmed = String(rawKey).trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(image[_]?1x1|image[_]?9x16)(?:[_\-]?([0-9]+))?$/i);
  if (!match) {
    return null;
  }

  const baseRaw = match[1].toLowerCase();
  const baseKey = baseRaw.includes('9x16') ? 'image_9x16' : 'image_1x1';
  const hasIndex = !!match[2];
  let index = 0;
  let rawIndex = 0;

  if (hasIndex) {
    const parsed = parseInt(match[2], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    index = parsed - 1;
    rawIndex = parsed;
  }

  return { baseKey, hasIndex, index, rawIndex };
}

function expandFieldKeySet(field) {
  const variants = new Set();
  variants.add(normalizeKeyName(field));
  const synonyms = COMPASS_FIELD_SYNONYMS[field] || [];
  for (const synonym of synonyms) {
    const normalized = normalizeKeyName(synonym);
    if (normalized) {
      variants.add(normalized);
    }
  }
  return variants;
}

function normalizeCompassFieldName(field = '') {
  const trimmed = typeof field === 'string' ? field.trim() : '';
  if (!trimmed) {
    return '';
  }

  const assetInfo = parseCompassAssetKey(trimmed);
  if (assetInfo) {
    return assetInfo.baseKey;
  }

  const lower = trimmed.toLowerCase();
  if (COMPASS_ALL_FIELDS.includes(lower)) {
    return lower;
  }

  return '';
}

function findCompassFieldForKey(rawKey = '') {
  const parsed = parseCompassAssetKey(rawKey);
  const keyForMatch = parsed ? parsed.baseKey : rawKey;
  const normalized = normalizeKeyName(keyForMatch);
  if (!normalized) {
    return '';
  }

  for (const field of COMPASS_ALL_FIELDS) {
    const variants = expandFieldKeySet(field);
    if (variants.has(normalized)) {
      return field;
    }
  }

  return '';
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

function deepSearchForField(source, keyVariants, visited = new Set()) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  if (visited.has(source)) {
    return undefined;
  }

  visited.add(source);

  const entries = Array.isArray(source) ? source.entries() : Object.entries(source);

  for (const [rawKey, value] of entries) {
    const key = normalizeKeyName(rawKey);
    if (keyVariants.has(key)) {
      const extracted = extractPrimitiveValue(value);
      if (extracted !== undefined) {
        return extracted;
      }
    }

    if (value && typeof value === 'object') {
      const nested = deepSearchForField(value, keyVariants, visited);
      if (nested !== undefined) {
        return nested;
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

function resolveFieldFromSources(sources, keyVariants) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = deepSearchForField(source, keyVariants, new Set());
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function gatherCompassFieldValues({ adData = {}, jobData = {}, adId }) {
  const normalizedAdId = normalizeString(adId || adData.id);
  const fieldValues = {};
  const errors = [];

  const adSources = [
    adData,
    adData.partnerFields,
    adData.partnerData,
    adData.compass,
    adData.adlog,
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
    jobData.compass,
    jobData.adlog,
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

  const overrideSources = [];
  if (normalizedAdId) {
    if (jobData.fieldOverrides && typeof jobData.fieldOverrides === 'object') {
      overrideSources.push(jobData.fieldOverrides[normalizedAdId]);
      overrideSources.push(jobData.fieldOverrides[adId]);
    }
    if (jobData.assetOverrides && typeof jobData.assetOverrides === 'object') {
      overrideSources.push(jobData.assetOverrides[normalizedAdId]);
      overrideSources.push(jobData.assetOverrides[adId]);
    }
    if (jobData.compassOverrides && typeof jobData.compassOverrides === 'object') {
      overrideSources.push(jobData.compassOverrides[normalizedAdId]);
      overrideSources.push(jobData.compassOverrides[adId]);
    }
  }

  const sourcesByPriority = [overrideSources, adSources, jobSources];

  const getFieldValue = (field) => {
    const keyVariants = expandFieldKeySet(field);
    for (const sourceGroup of sourcesByPriority) {
      const value = resolveFieldFromSources(sourceGroup, keyVariants);
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return undefined;
  };

  for (const field of [...COMPASS_REQUIRED_FIELDS, ...COMPASS_OPTIONAL_FIELDS]) {
    let rawValue = getFieldValue(field);

    if ((field === 'image_1x1' || field === 'image_9x16') && !rawValue) {
      const desiredAspect = field === 'image_1x1' ? '1x1' : '9x16';
      rawValue = extractAssetUrlByAspect(adData.assets, [desiredAspect]);
    }

    if (!rawValue && field === 'shop') {
      rawValue = normalizeString(jobData.brandCode || adData.brandCode || jobData.shop);
    }

    const primitiveValue = extractPrimitiveValue(rawValue);
    let finalValue = undefined;
    let error = '';

    switch (field) {
      case 'recipe_no': {
        const normalized = normalizeRecipeNumber(primitiveValue);
        finalValue = normalized.value;
        error = normalized.error;
        break;
      }
      case 'go_live_date': {
        const formatted = formatDateString(primitiveValue);
        if (formatted) {
          finalValue = formatted;
        } else if (primitiveValue) {
          error = 'Invalid go_live_date';
        }
        break;
      }
      case 'product_url': {
        const candidate = normalizeString(primitiveValue);
        if (candidate) {
          try {
            const parsed = new URL(candidate);
            if (['http:', 'https:'].includes(parsed.protocol.toLowerCase())) {
              finalValue = parsed.toString();
            } else {
              error = 'Invalid product_url';
            }
          } catch (err) {
            error = 'Invalid product_url';
          }
        }
        break;
      }
      case 'image_1x1':
      case 'image_9x16': {
        const candidate = normalizeString(primitiveValue);
        if (candidate) {
          const validation = validateAssetUrl(candidate);
          if (validation.valid) {
            finalValue = validation.url;
          } else {
            if (validation.reason === 'Missing asset URL') {
              error = `Missing ${COMPASS_FIELD_LABELS[field]}`;
            } else if (validation.reason && validation.reason !== 'Invalid asset URL.') {
              error = `${COMPASS_FIELD_LABELS[field]}: ${validation.reason}`;
            } else {
              error = `Invalid ${COMPASS_FIELD_LABELS[field]} URL`;
            }
          }
        }
        break;
      }
      case 'angle': {
        finalValue = normalizeAngleValue(primitiveValue);
        break;
      }
      default: {
        const candidate = primitiveValue;
        if (candidate instanceof Date) {
          finalValue = candidate.toISOString().slice(0, 10);
        } else if (typeof candidate === 'number') {
          finalValue = candidate;
        } else {
          finalValue = normalizeString(candidate);
        }
      }
    }

    if (error) {
      errors.push(error);
    }

    const isRequired = COMPASS_REQUIRED_FIELDS.includes(field);

    if ((finalValue === undefined || finalValue === null || finalValue === '' || (typeof finalValue === 'number' && !Number.isFinite(finalValue))) && !error) {
      if (isRequired) {
        errors.push(`Missing ${COMPASS_FIELD_LABELS[field]}`);
      }
    } else if (finalValue !== undefined && finalValue !== null && finalValue !== '') {
      fieldValues[field] = finalValue;
    }
  }

  return { fields: fieldValues, errors };
}

function parseCompassValidationError(error = '') {
  const trimmed = typeof error === 'string' ? error.trim() : '';

  if (!trimmed) {
    return { field: 'unknown', issue: 'Unknown validation error', raw: error };
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > -1) {
    const field = trimmed.slice(0, colonIndex).trim() || 'unknown';
    const issue = trimmed.slice(colonIndex + 1).trim() || trimmed;
    return { field, issue, raw: error };
  }

  const missingMatch = trimmed.match(/^Missing\s+(.+)$/i);
  if (missingMatch) {
    const field = missingMatch[1].trim() || 'unknown';
    return { field, issue: `Missing ${field}`, raw: error };
  }

  const invalidUrlMatch = trimmed.match(/^Invalid\s+(.+?)\s+URL$/i);
  if (invalidUrlMatch) {
    const field = invalidUrlMatch[1].trim() || 'unknown';
    return { field, issue: 'Invalid URL', raw: error };
  }

  return { field: 'unknown', issue: trimmed, raw: error };
}

function formatCompassValidationErrors({ errors = [], adId, adData = {} }) {
  const adIdValue = adId !== undefined && adId !== null ? adId : 'unknown';
  const adIdString = typeof adIdValue === 'string' ? adIdValue : String(adIdValue);
  const parsedErrors = errors.map((error) => parseCompassValidationError(error));
  const errorLines = parsedErrors.map(
    ({ field, issue }) => `- Field: ${field} | Issue: ${issue || 'Unknown validation issue'}`,
  );
  const adDataKeys =
    adData && typeof adData === 'object' && !Array.isArray(adData) ? Object.keys(adData) : [];

  const messageLines = [
    `Invalid Compass payload for adId=${adIdString}`,
    ...errorLines,
    `Ad data keys: ${JSON.stringify(adDataKeys)}`,
  ];

  return {
    message: messageLines.join('\n'),
    details: {
      adId: adIdString,
      errors: parsedErrors,
      adDataKeys,
      rawErrors: errors,
    },
  };
}

const compassIntegration = {
  key: COMPASS_INTEGRATION_KEY,
  label: 'Compass AdLog',
  requiredFields: [],
  getEndpoint(jobData = {}) {
    const override = normalizeString(jobData.endpointOverride);
    if (override) return override;

    const jobDefinedEndpoint = resolveCompassEndpointFromJobData(jobData);
    if (jobDefinedEndpoint) {
      return jobDefinedEndpoint;
    }

    const targetEnvRaw =
      normalizeString(jobData.targetEnv) || normalizeString(jobData.targetEnvironment);
    const targetEnv = targetEnvRaw ? targetEnvRaw.toLowerCase() : '';

    if (targetEnv === 'prod' || targetEnv === 'production') {
      const prodEndpoint =
        normalizeString(process.env.COMPASS_EXPORT_ENDPOINT_PROD) ||
        normalizeString(process.env.ADLOG_EXPORT_ENDPOINT_PROD);
      if (prodEndpoint) {
        return prodEndpoint;
      }
    }

    if (targetEnv === 'staging' || targetEnv === 'stage' || targetEnv === 'stg') {
      const stagingEndpoint =
        normalizeString(process.env.COMPASS_EXPORT_ENDPOINT_STAGING) ||
        normalizeString(process.env.ADLOG_EXPORT_ENDPOINT_STAGING);
      if (stagingEndpoint) {
        return stagingEndpoint;
      }
    }

    return (
      normalizeString(process.env.COMPASS_EXPORT_ENDPOINT) ||
      normalizeString(process.env.ADLOG_EXPORT_ENDPOINT) ||
      DEFAULT_COMPASS_EXPORT_ENDPOINT
    );
  },
  buildPayload({ adData = {}, jobData = {}, jobId }) {
    const { fields, errors } = gatherCompassFieldValues({ adData, jobData, adId: adData.id || jobId });

    if (Array.isArray(errors) && errors.length > 0) {
      const adIdentifier =
        adData && adData.id !== undefined && adData.id !== null ? adData.id : jobId;
      const { message, details } = formatCompassValidationErrors({
        errors,
        adId: adIdentifier,
        adData,
      });

      console.error('Compass payload validation error', details);
      throw new Error(message);
    }

    const payload = {};

    for (const field of COMPASS_REQUIRED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(fields, field)) {
        payload[field] = fields[field];
      }
    }

    for (const field of COMPASS_OPTIONAL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(fields, field)) {
        payload[field] = fields[field];
      }
    }

    return payload;
  },
  async handleResponse({ response, rawBody, parsedBody }) {
    const messageFromBody =
      (parsedBody && (parsedBody.message || parsedBody.detail || parsedBody.error)) || rawBody || response.statusText;

    if (response.status === 202) {
      return { state: 'sent', message: messageFromBody || 'Accepted by partner' };
    }

    if ([200, 201, 204].includes(response.status)) {
      return { state: 'received', message: messageFromBody || 'Delivered to partner' };
    }

    if ([208, 409].includes(response.status)) {
      return { state: 'duplicate', message: messageFromBody || 'Duplicate export' };
    }

    return {
      state: 'error',
      message: messageFromBody || `Unexpected status ${response.status}`,
    };
  },
  validateAd({ adData = {}, jobData = {} }) {
    const { errors } = gatherCompassFieldValues({ adData, jobData, adId: adData.id });

    return {
      errors: Array.isArray(errors) ? errors.filter(Boolean) : [],
    };
  },
  aliases: ['adlog'],
};

function buildIntegrationFromConfig(config) {
  if (!config || !config.key) {
    return null;
  }

  const normalizedKey = config.key;
  const hasMapping =
    config.fieldMapping && Object.keys(config.fieldMapping).length > 0;

  let integration;

  if (normalizedKey === COMPASS_INTEGRATION_KEY) {
    integration = { ...compassIntegration };
    integration.aliases = Array.isArray(compassIntegration.aliases)
      ? [...compassIntegration.aliases]
      : [];
  } else if (!hasMapping) {
    return null;
  } else {
    integration = {
      key: normalizedKey,
      label: config.label || config.partnerKey || normalizedKey,
      requiredFields: [],
    };
  }

  integration.partnerKey = config.partnerKey || normalizedKey;
  integration.label = config.label || integration.label || integration.partnerKey;
  integration.recipeTypeId = config.recipeTypeId || '';
  integration.fieldMapping = config.fieldMapping || {};
  integration.config = config;

  const configuredEndpoint = normalizeHttpUrl(config.baseUrl) || normalizeString(config.baseUrl);
  if (configuredEndpoint) {
    integration.endpoint = configuredEndpoint;
    integration.getEndpoint = (jobData = {}) => {
      if (
        normalizedKey === COMPASS_INTEGRATION_KEY &&
        typeof compassIntegration.getEndpoint === 'function'
      ) {
        const jobDefined = compassIntegration.getEndpoint(jobData);
        if (jobDefined) {
          return jobDefined;
        }
      }
      return configuredEndpoint;
    };
  }

  const headers = buildHeadersForConfig(config);
  if (Object.keys(headers).length > 0) {
    integration.buildHeaders = () => ({ ...headers });
  }

  if (hasMapping) {
    integration.buildPayload = async ({
      adData = {},
      jobData = {},
      assetUrl = '',
      jobId,
    }) =>
      buildPayloadFromMapping({
        fieldMapping: config.fieldMapping,
        adData,
        jobData,
        assetUrl,
        integrationKey: normalizedKey,
        adId: adData?.id || jobId,
      });
  }

  return integration;
}

const integrationRegistry = {
  [compassIntegration.key]: compassIntegration,
};

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

  if (integrationRegistry[normalized]) {
    return integrationRegistry[normalized];
  }

  for (const integration of Object.values(integrationRegistry)) {
    if (Array.isArray(integration.aliases) && integration.aliases.includes(normalized)) {
      return integration;
    }
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

  Object.values(integrationRegistry).forEach((integration) => {
    if (seen.has(integration.key)) {
      return;
    }
    seen.add(integration.key);
    entries.push({ key: integration.key, label: integration.label });
  });

  return entries;
}

export function __resetIntegrationCache() {
  cachedIntegrationSettings = null;
  cachedIntegrationFetchTime = 0;
}
