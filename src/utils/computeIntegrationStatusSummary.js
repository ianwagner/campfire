import {
  isErrorStatusCode,
  resolveIntegrationResponseStatus,
} from './integrationStatus';

const SUCCESS_STATES = new Set(['received', 'succeeded', 'completed', 'delivered']);
const DUPLICATE_STATES = new Set(['duplicate']);
const ERROR_STATES = new Set(['error', 'failed', 'rejected']);

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
      } catch (err) {
        // fall through
      }
    }
    if (typeof value.seconds === 'number') {
      const seconds = value.seconds;
      const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
      return seconds * 1000 + nanos / 1e6;
    }
  }
  return 0;
};

const normalizeStatuses = (asset) => {
  if (!asset || typeof asset !== 'object') return null;
  if (asset.integrationStatuses && typeof asset.integrationStatuses === 'object') {
    return asset.integrationStatuses;
  }
  if (asset.integrationStatus && typeof asset.integrationStatus === 'object') {
    return asset.integrationStatus;
  }
  return null;
};

const computeIntegrationStatusSummary = (
  assignedIntegrationId,
  assignedIntegrationName = '',
  assets = [],
) => {
  const integrationId = typeof assignedIntegrationId === 'string'
    ? assignedIntegrationId.trim()
    : '';
  if (!integrationId) {
    return null;
  }

  const integrationName =
    typeof assignedIntegrationName === 'string' ? assignedIntegrationName : '';

  let latestPositive = null;
  let latestError = null;
  let hasStatuses = false;

  (Array.isArray(assets) ? assets : []).forEach((asset) => {
    const statuses = normalizeStatuses(asset);
    if (!statuses) return;
    const entry = statuses[integrationId];
    if (!entry || typeof entry !== 'object') return;
    hasStatuses = true;
    const stateRaw = typeof entry.state === 'string' ? entry.state.toLowerCase() : '';
    const updatedAt = toMillis(entry.updatedAt);
    const responseStatus = resolveIntegrationResponseStatus(entry);
    const responseStatusIsError = isErrorStatusCode(responseStatus);
    const normalizedState = responseStatusIsError && !stateRaw ? 'error' : stateRaw;
    const normalized = {
      state: normalizedState,
      updatedAt,
      errorMessage:
        typeof entry.errorMessage === 'string' ? entry.errorMessage.trim() : '',
      responseStatus,
      isDuplicate: DUPLICATE_STATES.has(normalizedState),
    };

    if (normalized.isDuplicate) {
      if (!latestPositive || updatedAt > latestPositive.updatedAt) {
        latestPositive = normalized;
      }
    } else if (SUCCESS_STATES.has(stateRaw) && !responseStatusIsError) {
      if (!latestPositive || updatedAt > latestPositive.updatedAt) {
        latestPositive = normalized;
      }
    } else if (ERROR_STATES.has(stateRaw) || responseStatusIsError) {
      if (!latestError || updatedAt > latestError.updatedAt) {
        latestError = normalized;
      }
    }
  });

  if (!latestPositive && !latestError) {
    if (!hasStatuses) {
      return {
        integrationId,
        integrationName,
        wasTriggered: false,
        outcome: null,
        latestState: '',
        updatedAt: null,
        errorMessage: '',
        responseStatus: null,
      };
    }
    // statuses exist but none success/error
    return {
      integrationId,
      integrationName,
      wasTriggered: true,
      outcome: null,
      latestState: '',
      updatedAt: null,
      errorMessage: '',
      responseStatus: null,
    };
  }

  if (latestPositive && (!latestError || latestPositive.updatedAt >= latestError.updatedAt)) {
    return {
      integrationId,
      integrationName,
      wasTriggered: true,
      outcome: 'success',
      latestState: latestPositive.state,
      updatedAt: latestPositive.updatedAt,
      errorMessage: '',
      responseStatus: latestPositive.responseStatus,
    };
  }

  return {
    integrationId,
    integrationName,
    wasTriggered: true,
    outcome: 'error',
    latestState: latestError ? latestError.state : '',
    updatedAt: latestError ? latestError.updatedAt : null,
    errorMessage: latestError ? latestError.errorMessage : '',
    responseStatus: latestError ? latestError.responseStatus : null,
  };
};

export default computeIntegrationStatusSummary;
