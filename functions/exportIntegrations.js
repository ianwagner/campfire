import { URL } from 'url';

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

function extractAssetUrlByAspect(assets = [], aspectTargets = []) {
  if (!Array.isArray(assets)) {
    return '';
  }

  const normalizedTargets = aspectTargets.map((aspect) => normalizeAspectKey(aspect)).filter(Boolean);
  if (normalizedTargets.length === 0) {
    return '';
  }

  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;
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

    const normalizedAspectCandidates = aspectCandidates
      .map((value) => normalizeAspectKey(value))
      .filter(Boolean);

    if (normalizedAspectCandidates.some((value) => normalizedTargets.includes(value))) {
      const urlCandidates = [
        asset.url,
        asset.downloadUrl,
        asset.assetUrl,
        asset.firebaseUrl,
        asset.sourceUrl,
        asset.adUrl,
      ];
      for (const candidate of urlCandidates) {
        const normalized = normalizeString(candidate);
        if (normalized) {
          const { valid } = validateAssetUrl(normalized);
          if (valid) {
            return normalized;
          }
        }
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

const compassIntegration = {
  key: 'compass',
  label: 'Compass AdLog',
  requiredFields: [],
  getEndpoint(jobData = {}) {
    const override = normalizeString(jobData.endpointOverride);
    if (override) return override;

    const jobDefinedEndpoint = resolveCompassEndpointFromJobData(jobData);
    if (jobDefinedEndpoint) {
      return jobDefinedEndpoint;
    }

    const targetEnv = normalizeString(jobData.targetEnv);
    if (targetEnv === 'prod' || targetEnv === 'production') {
      const prodEndpoint =
        normalizeString(process.env.COMPASS_EXPORT_ENDPOINT_PROD) ||
        normalizeString(process.env.ADLOG_EXPORT_ENDPOINT_PROD);
      if (prodEndpoint) {
        return prodEndpoint;
      }
    }

    if (targetEnv === 'staging' || targetEnv === 'stage') {
      const stagingEndpoint =
        normalizeString(process.env.COMPASS_EXPORT_ENDPOINT_STAGING) ||
        normalizeString(process.env.ADLOG_EXPORT_ENDPOINT_STAGING);
      if (stagingEndpoint) {
        return stagingEndpoint;
      }
    }

    return (
      normalizeString(process.env.COMPASS_EXPORT_ENDPOINT) ||
      normalizeString(process.env.ADLOG_EXPORT_ENDPOINT)
    );
  },
  buildPayload({ adData = {}, jobData = {}, jobId }) {
    const { fields, errors } = gatherCompassFieldValues({ adData, jobData, adId: adData.id || jobId });

    if (Array.isArray(errors) && errors.length > 0) {
      throw new Error(`Invalid Compass payload: ${errors.join('; ')}`);
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

const integrationRegistry = {
  [compassIntegration.key]: compassIntegration,
};

export function getIntegration(key) {
  const normalized = normalizeString(key).toLowerCase();
  if (!normalized) return null;
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

export function listIntegrations() {
  return Object.values(integrationRegistry).map((integration) => ({
    key: integration.key,
    label: integration.label,
  }));
}
