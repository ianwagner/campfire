// Prints even before Firestore event is decoded
console.log("BOOT versions", {
  node: process.versions.node,
});

import { onCall as onCallFn, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import admin from "firebase-admin";
import { patchFirestoreProtobufDecoding } from "./firestoreProtobufPatch.js";
import { getIntegration, resolveAssetUrl, validateAssetUrl } from "./exportIntegrations.js";

patchFirestoreProtobufDecoding();

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const successStates = new Set(['sent', 'received', 'duplicate']);

const SHARED_SECRET_HEADER = 'x-export-worker-secret';

function normalizeJobId(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function enforceSharedSecret(request, payload) {
  const requiredSecretRaw =
    process.env.EXPORT_WORKER_SECRET || process.env.RUN_EXPORT_JOB_SECRET || '';
  const requiredSecret =
    typeof requiredSecretRaw === 'string'
      ? requiredSecretRaw.trim()
      : String(requiredSecretRaw || '').trim();
  if (!requiredSecret) {
    return;
  }

  const rawRequest = request?.rawRequest || request;
  const headers = rawRequest?.headers;
  const candidates = [];
  if (headers) {
    const headerKeys = [
      SHARED_SECRET_HEADER,
      SHARED_SECRET_HEADER.toLowerCase(),
      SHARED_SECRET_HEADER.toUpperCase(),
    ];
    for (const key of headerKeys) {
      const value = headers[key];
      if (Array.isArray(value)) {
        candidates.push(...value);
      } else {
        candidates.push(value);
      }
    }
  }

  if (payload && typeof payload === 'object') {
    candidates.push(payload.secret, payload.sharedSecret, payload.token);
  }

  const normalizedSecret = requiredSecret;
  const normalizedCandidates = candidates
    .filter((value) => value !== undefined && value !== null)
    .map((value) => {
      if (typeof value === 'string') {
        return value.trim();
      }
      return String(value);
    })
    .filter(Boolean);

  if (!normalizedCandidates.some((value) => value === normalizedSecret)) {
    console.warn('runExportJob denied due to invalid shared secret');
    throw new HttpsError('permission-denied', 'Invalid authentication secret');
  }
}

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
    normalizeString(jobData.targetIntegration) ||
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

async function executeExportJob({ jobRef, jobData, jobId }) {
  const integrationKey = resolveIntegrationKey(jobData);
  const integration = await getIntegration(integrationKey);

  if (!integration) {
    const completedAt = admin.firestore.FieldValue.serverTimestamp();
    const summary = emptySummary(`Unknown integration: ${integrationKey || 'unspecified'}`);
    await jobRef.set(
      {
        status: 'failed',
        summary,
        completedAt,
        updatedAt: completedAt,
      },
      { merge: true }
    );
    console.warn('Export job failed due to unknown integration', { jobId, integrationKey });
    return { jobId, status: 'failed', counts: summary.counts };
  }

  const endpoint = typeof integration.getEndpoint === 'function'
    ? integration.getEndpoint(jobData)
    : normalizeString(integration.endpoint);
  if (!endpoint) {
    const completedAt = admin.firestore.FieldValue.serverTimestamp();
    const summary = emptySummary('Missing integration endpoint');
    await jobRef.set(
      {
        status: 'failed',
        summary,
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
    return { jobId, status: 'failed', counts: summary.counts };
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
    const summary = {
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
    };
    await jobRef.set(
      {
        status: 'success',
        summary,
        syncStatus: {},
        completedAt,
        updatedAt: completedAt,
      },
      { merge: true }
    );
    console.log('Export job completed without ads', { jobId, integration: integration.key });
    return { jobId, status: 'success', counts: summary.counts };
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

        const { valid: assetUrlValid, reason: assetUrlError, url: normalizedAssetUrl } = validateAssetUrl(assetUrl);
        if (!assetUrlValid) {
          if (assetUrlError && !validationErrors.includes(assetUrlError)) {
            validationErrors.push(assetUrlError);
          }
        }

        const requiredFields = Array.isArray(integration.requiredFields) ? integration.requiredFields : [];
        for (const field of requiredFields) {
          const value = field === 'assetUrl' ? assetUrl : resolveRequiredFieldValue(field, adData, jobData);
          if (!normalizeString(value)) {
            const missingMessage = field === 'assetUrl' ? 'Missing asset URL' : `Missing ${field}`;
            if (!validationErrors.includes(missingMessage)) {
              validationErrors.push(missingMessage);
            }
          }
        }

        if (validationErrors.length > 0) {
          state = 'error';
          message = validationErrors.join('; ');
        } else {
          assetUrl = normalizedAssetUrl || assetUrl;
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
  const summaryStatus =
    successCount === total ? 'success' : successCount === 0 ? 'failed' : 'partial';

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

  return { jobId, status: summaryStatus, counts: summary.counts };
}

function extractJobId(payload) {
  const jobIdRaw =
    (payload && (payload.jobId ?? payload.jobID ?? payload.id)) !== undefined
      ? payload.jobId ?? payload.jobID ?? payload.id
      : undefined;
  return normalizeJobId(jobIdRaw);
}

async function runExportJobById(jobId) {
  if (!jobId) {
    throw new HttpsError('invalid-argument', 'A jobId must be provided');
  }

  console.log('runExportJob invoked', process.env.GCLOUD_PROJECT, 'jobId:', jobId);

  const jobRef = db.collection('exportJobs').doc(jobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    throw new HttpsError('not-found', `Export job ${jobId} not found`);
  }

  const jobData = jobSnap.data() || {};

  console.log(
    'runExportJob executing',
    process.env.GCLOUD_PROJECT,
    'targetEnv:',
    jobData?.targetEnv,
  );

  const result = await executeExportJob({ jobRef, jobData, jobId });
  return result || { jobId, status: jobData?.status || 'pending', counts: jobData?.summary?.counts };
}

export const processExportJob = onDocumentCreated(
  { region: "us-central1", document: "exportJobs/{jobId}" },
  async (event) => {
    let snapshot = event.data;
    const paramsJobId = normalizeJobId(event.params?.jobId);
    let jobId = paramsJobId;
    let jobRef;
    let jobData;

    if (snapshot) {
      jobRef = snapshot.ref;
      jobData = snapshot.data() || {};
      jobId = normalizeJobId(snapshot.id) || jobId;
    } else {
      const fallbackJobId = jobId;

      if (!fallbackJobId) {
        console.error("processExportJob: missing Firestore snapshot and jobId");
        return;
      }

      try {
        const fallbackSnapshot = await db.collection("exportJobs").doc(fallbackJobId).get();
        if (!fallbackSnapshot.exists) {
          console.error("processExportJob: export job not found", { jobId: fallbackJobId });
          return;
        }
        snapshot = fallbackSnapshot;
        jobRef = fallbackSnapshot.ref;
        jobData = fallbackSnapshot.data() || {};
        jobId = fallbackJobId;
        console.warn("processExportJob: recovered missing snapshot from Firestore", {
          jobId: fallbackJobId,
        });
      } catch (err) {
        console.error("processExportJob: failed to load job snapshot", {
          jobId: fallbackJobId,
          error: err?.message || String(err),
        });
        return;
      }
    }

    if (!jobRef || !jobData) {
      console.error("processExportJob: unable to resolve job data", { jobId });
      return;
    }

    console.log(
      "processExportJob triggered via Firestore",
      process.env.GCLOUD_PROJECT,
      "jobId:",
      jobId,
    );

    await executeExportJob({ jobRef, jobData, jobId });
  },
);

export const processExportJobCallable = onCallFn({ region: 'us-central1', timeoutSeconds: 540 }, async (request) => {
  const payload = request && typeof request === 'object' && 'data' in request ? request.data : request;
  const jobId = extractJobId(payload);
  const result = await runExportJobById(jobId);
  return result;
});

export const runExportJob = onCallFn({ region: 'us-central1', timeoutSeconds: 540 }, async (request) => {
  const payload = request && typeof request === 'object' && 'data' in request ? request.data : request;
  enforceSharedSecret(request, payload);
  const jobId = extractJobId(payload);
  const result = await runExportJobById(jobId);
  return { status: result.status, counts: result.counts || null };
});
