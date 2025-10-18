import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import admin from 'firebase-admin';
import { getIntegration, resolveAssetUrl } from './exportIntegrations.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const successStates = new Set(['sent', 'received', 'duplicate']);

function normalizeString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function uniqueStringArray(values) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeString(typeof value === 'string' ? value : value?.id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function resolveIntegrationKey(jobData = {}) {
  return (
    normalizeString(jobData.integrationKey) ||
    normalizeString(jobData.partnerKey) ||
    normalizeString(jobData.partner) ||
    normalizeString(jobData.destination)
  );
}

function resolveRequiredFieldValue(field, adData, jobData) {
  if (!field) return '';
  const path = field.split('.');
  const sources = [adData, jobData];
  for (const source of sources) {
    let cursor = source;
    let valid = true;
    for (const segment of path) {
      if (!cursor || typeof cursor !== 'object') {
        valid = false;
        break;
      }
      cursor = cursor[segment];
    }
    if (valid) {
      const normalized = normalizeString(cursor);
      if (normalized) return normalized;
    }
  }
  return '';
}

function buildHeaders(integration, context) {
  const headers = { 'Content-Type': 'application/json' };
  if (typeof integration.buildHeaders === 'function') {
    const custom = integration.buildHeaders(context) || {};
    for (const [key, value] of Object.entries(custom)) {
      if (value !== undefined && value !== null) {
        headers[key] = value;
      }
    }
  } else if (integration.headers && typeof integration.headers === 'object') {
    for (const [key, value] of Object.entries(integration.headers)) {
      if (value !== undefined && value !== null) {
        headers[key] = value;
      }
    }
  }
  return headers;
}

function defaultHandleResponse(response) {
  if (response.ok) {
    return { state: 'received', message: response.statusText || 'Delivered to partner' };
  }
  return {
    state: 'error',
    message: response.statusText || `HTTP ${response.status}`,
  };
}

function emptySummary(message = '') {
  return {
    status: 'failed',
    counts: {
      total: 0,
      sent: 0,
      received: 0,
      duplicate: 0,
      error: 0,
      success: 0,
    },
    message,
  };
}

export const processExportJob = onDocumentCreated('exportJobs/{jobId}', async (event) => {
  const snap = event.data;
  if (!snap) {
    return null;
  }

  const jobRef = snap.ref;
  const jobData = snap.data() || {};
  const jobId = event.params.jobId;

  const integrationKey = resolveIntegrationKey(jobData);
  const integration = getIntegration(integrationKey);

  if (!integration) {
    const completedAt = admin.firestore.FieldValue.serverTimestamp();
    await jobRef.set(
      {
        status: 'failed',
        summary: emptySummary(`Unknown integration: ${integrationKey || 'unspecified'}`),
        completedAt,
        updatedAt: completedAt,
      },
      { merge: true }
    );
    console.warn('Export job failed due to unknown integration', { jobId, integrationKey });
    return null;
  }

  const endpoint = typeof integration.getEndpoint === 'function' ? integration.getEndpoint(jobData) : normalizeString(integration.endpoint);
  if (!endpoint) {
    const completedAt = admin.firestore.FieldValue.serverTimestamp();
    await jobRef.set(
      {
        status: 'failed',
        summary: emptySummary('Missing integration endpoint'),
        integration: {
          key: integration.key,
          label: integration.label,
        },
        completedAt,
        updatedAt: completedAt,
      },
      { merge: true }
    );
    console.error('Export job failed due to missing endpoint', { jobId, integrationKey: integration.key });
    return null;
  }

  const approvedIds = uniqueStringArray(jobData.approvedAdIds);
  const fallbackIds = uniqueStringArray(jobData.adIds);
  const embeddedIds = Array.isArray(jobData.ads)
    ? uniqueStringArray(jobData.ads.map((item) => (typeof item === 'string' ? item : item?.id)))
    : [];
  const adIds = uniqueStringArray([...approvedIds, ...fallbackIds, ...embeddedIds]);

  const startedAt = admin.firestore.FieldValue.serverTimestamp();
  await jobRef.set(
    {
      status: 'processing',
      startedAt,
      updatedAt: startedAt,
      integration: {
        key: integration.key,
        label: integration.label,
        endpoint,
      },
    },
    { merge: true }
  );

  if (adIds.length === 0) {
    const completedAt = admin.firestore.FieldValue.serverTimestamp();
    await jobRef.set(
      {
        status: 'success',
        summary: {
          status: 'success',
          counts: {
            total: 0,
            sent: 0,
            received: 0,
            duplicate: 0,
            error: 0,
            success: 0,
          },
          message: 'No approved ads to export',
        },
        syncStatus: {},
        completedAt,
        updatedAt: completedAt,
      },
      { merge: true }
    );
    console.log('Export job completed without ads', { jobId, integration: integration.key });
    return null;
  }

  const syncStatus = {};
  const counters = {
    sent: 0,
    received: 0,
    duplicate: 0,
    error: 0,
  };

  for (const adId of adIds) {
    let state = 'error';
    let message = '';
    let payload = null;
    let assetUrl = '';

    try {
      const adSnap = await db.collection('adAssets').doc(adId).get();
      if (!adSnap.exists) {
        message = 'Ad asset not found';
      } else {
        const adData = { ...adSnap.data(), id: adSnap.id };
        const validationErrors = [];

        assetUrl = normalizeString(jobData.assetOverrides?.[adId]?.assetUrl) || resolveAssetUrl(adData);

        if (typeof integration.validateAd === 'function') {
          const result = await integration.validateAd({ adData, jobData, assetUrl });
          if (result && typeof result === 'object') {
            if (Array.isArray(result.errors)) {
              validationErrors.push(...result.errors.filter(Boolean));
            }
            if (normalizeString(result.assetUrl)) {
              assetUrl = normalizeString(result.assetUrl);
            }
          }
        }

        if (!assetUrl) {
          validationErrors.push('Missing assetUrl');
        } else {
          try {
            new URL(assetUrl);
          } catch (err) {
            validationErrors.push('Invalid assetUrl');
          }
        }

        const requiredFields = Array.isArray(integration.requiredFields) ? integration.requiredFields : [];
        for (const field of requiredFields) {
          const value = field === 'assetUrl' ? assetUrl : resolveRequiredFieldValue(field, adData, jobData);
          if (!normalizeString(value)) {
            validationErrors.push(`Missing ${field}`);
          }
        }

        if (validationErrors.length > 0) {
          state = 'error';
          message = validationErrors.join('; ');
        } else {
          payload = integration.buildPayload
            ? await integration.buildPayload({ adData, jobData, jobId, assetUrl, integration })
            : null;

          if (!payload || typeof payload !== 'object') {
            state = 'error';
            message = 'Integration payload could not be built';
          } else {
            const headers = buildHeaders(integration, { jobData, adData, jobId, assetUrl });
            let response;
            try {
              response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
              });
            } catch (err) {
              response = null;
              message = `Network error: ${err.message || err.toString()}`;
              state = 'error';
            }

            if (response) {
              let rawBody = '';
              try {
                rawBody = await response.text();
              } catch (err) {
                rawBody = '';
              }

              let parsedBody;
              if (rawBody) {
                try {
                  parsedBody = JSON.parse(rawBody);
                } catch (err) {
                  parsedBody = undefined;
                }
              }

              const handlerResult = integration.handleResponse
                ? await integration.handleResponse({ response, payload, adData, jobData, rawBody, parsedBody })
                : defaultHandleResponse(response);

              const resolvedState = normalizeString(handlerResult?.state);
              state = resolvedState ? resolvedState.toLowerCase() : response.ok ? 'received' : 'error';
              const resolvedMessage = normalizeString(handlerResult?.message);
              message = resolvedMessage || (response.ok ? 'Delivered to partner' : `HTTP ${response.status}`);
            }
          }
        }
      }
    } catch (err) {
      state = 'error';
      message = message || err.message || 'Unexpected error';
      console.error('Failed to process export for ad', { jobId, adId, error: err });
    }

    if (state === 'error') {
      counters.error += 1;
    } else if (successStates.has(state)) {
      counters[state] += 1;
    } else {
      counters.sent += 1;
    }

    syncStatus[adId] = {
      state,
      message,
      attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      assetUrl: assetUrl || null,
    };
  }

  const total = adIds.length;
  const successCount = total - counters.error;
  const completedAt = admin.firestore.FieldValue.serverTimestamp();
  const summaryStatus = successCount === total
    ? 'success'
    : successCount === 0
      ? 'failed'
      : 'partial';

  const summary = {
    status: summaryStatus,
    counts: {
      total,
      sent: counters.sent,
      received: counters.received,
      duplicate: counters.duplicate,
      error: counters.error,
      success: successCount,
    },
  };

  await jobRef.set(
    {
      status: summaryStatus,
      summary,
      syncStatus,
      completedAt,
      updatedAt: completedAt,
    },
    { merge: true }
  );

  console.log('Export job completed', {
    jobId,
    integration: integration.key,
    status: summaryStatus,
    counts: summary.counts,
  });

  return null;
});
