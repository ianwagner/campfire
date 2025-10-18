import { URL } from 'url';

function normalizeString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
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

const compassIntegration = {
  key: 'compass',
  label: 'Compass AdLog',
  requiredFields: ['assetUrl', 'brandCode'],
  getEndpoint(jobData = {}) {
    const override = normalizeString(jobData.endpointOverride);
    if (override) return override;

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
  buildPayload({ adData = {}, jobData = {}, jobId, assetUrl }) {
    return {
      job: {
        id: jobId,
        integrationKey: 'compass',
        label: 'Compass AdLog',
        partnerJobId: normalizeString(jobData.partnerJobId),
        triggeredBy: normalizeString(jobData.triggeredBy || jobData.createdBy),
        brandCode: normalizeString(jobData.brandCode),
        groupDesc: normalizeString(jobData.groupDesc || jobData.adGroupName),
        targetEnv: normalizeString(jobData.targetEnv),
        metadata: jobData.metadata || {},
        requestedAt: jobData.requestedAt || jobData.createdAt || null,
      },
      ad: {
        id: adData.id,
        adGroupId: adData.adGroupId || null,
        brandCode: normalizeString(adData.brandCode || jobData.brandCode),
        name: normalizeString(adData.name || adData.title),
        type: normalizeString(adData.type || adData.assetType || adData.kind),
        status: normalizeString(adData.status),
        groupDesc: normalizeString(jobData.groupDesc || jobData.adGroupName),
        assetUrl,
        tags: Array.isArray(adData.tags) ? adData.tags : [],
        metadata: adData.metadata || {},
      },
    };
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
  validateAd({ adData = {}, jobData = {}, assetUrl }) {
    const errors = [];
    const brandCode = normalizeString(adData.brandCode || jobData.brandCode);
    if (!brandCode) {
      errors.push('Missing brandCode');
    }

    const { valid, reason, url } = validateAssetUrl(assetUrl || resolveAssetUrl(adData));
    if (!valid) {
      errors.push(reason);
    }

    return {
      errors,
      assetUrl: url,
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
