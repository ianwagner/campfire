import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import getVersion from './getVersion';
import parseAdFilename from './parseAdFilename';
import { isErrorStatusCode, toStatusCode } from './integrationStatus';

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

const normalizeRecipeIdentifier = (value) => {
  const normalized = normalizeKeyPart(value);
  if (!normalized) return '';
  const withoutLeadingZeros = normalized.replace(/^0+/, '');
  return withoutLeadingZeros || normalized;
};

const RECIPE_FIELD_NAME_KEYS = [
  'key',
  'name',
  'label',
  'field',
  'title',
  'question',
  'prompt',
];

const RECIPE_FIELD_VALUE_KEYS = [
  'value',
  'answer',
  'text',
  'content',
  'response',
  'data',
  'val',
  'number',
  'code',
  'id',
];

const normalizedKeyMatch = (key, keys) => {
  const normalizedKey = normalizeKeyPart(key).toLowerCase();
  if (!normalizedKey) {
    return false;
  }
  return keys.some(
    (candidate) => normalizeKeyPart(candidate).toLowerCase() === normalizedKey,
  );
};

const extractRecipeValueFromEntry = (entry, keys) => {
  if (!entry || typeof entry !== 'object') {
    return '';
  }

  for (const nameKey of RECIPE_FIELD_NAME_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(entry, nameKey)) {
      continue;
    }
    const rawName = entry[nameKey];
    if (!normalizedKeyMatch(rawName, keys)) {
      continue;
    }

    for (const valueKey of RECIPE_FIELD_VALUE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(entry, valueKey)) {
        continue;
      }
      const candidate = normalizeRecipeIdentifier(entry[valueKey]);
      if (candidate) {
        return candidate;
      }

      const nestedValue = entry[valueKey];
      if (nestedValue && typeof nestedValue === 'object') {
        const nestedCandidate = getRecipeFieldCandidate(nestedValue, keys);
        if (nestedCandidate) {
          return nestedCandidate;
        }
      }
    }
  }

  return '';
};

const getRecipeFieldCandidate = (source, keys) => {
  if (!source) {
    return '';
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry) {
        continue;
      }
      const candidate = getRecipeFieldCandidate(entry, keys);
      if (candidate) {
        return candidate;
      }

      const extracted = extractRecipeValueFromEntry(entry, keys);
      if (extracted) {
        return extracted;
      }
    }
    return '';
  }

  if (typeof source !== 'object') {
    return '';
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const candidate = normalizeRecipeIdentifier(source[key]);
    if (candidate) {
      return candidate;
    }
  }

  for (const [entryKey, value] of Object.entries(source)) {
    if (!normalizedKeyMatch(entryKey, keys)) {
      continue;
    }
    const candidate = normalizeRecipeIdentifier(value);
    if (candidate) {
      return candidate;
    }
    if (value && typeof value === 'object') {
      const nestedCandidate = getRecipeFieldCandidate(value, keys);
      if (nestedCandidate) {
        return nestedCandidate;
      }
    }
  }

  for (const value of Object.values(source)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const candidate = getRecipeFieldCandidate(value, keys);
    if (candidate) {
      return candidate;
    }
  }

  return '';
};

const getAssetRecipeIdentifier = (asset) => {
  if (!asset || typeof asset !== 'object') {
    return '';
  }

  const recipeFieldsCandidate = getRecipeFieldCandidate(asset.recipeFields, [
    'Recipe Number',
    'Recipe #',
    'Recipe No',
    'Recipe',
    'Recipe Id',
    'RecipeID',
    'Recipe Code',
    'RecipeCode',
  ]);
  if (recipeFieldsCandidate) {
    return recipeFieldsCandidate;
  }

  const directCandidate = getRecipeFieldCandidate(asset, [
    'recipeNumber',
    'recipe_number',
    'recipeNo',
    'recipe_no',
    'recipe',
    'recipeCode',
    'recipe_code',
    'recipeId',
    'recipe_id',
  ]);
  if (directCandidate) {
    return directCandidate;
  }

  const nestedRecipeCandidate = getRecipeFieldCandidate(asset.recipe, [
    'number',
    'recipeNumber',
    'recipe_number',
    'code',
    'recipeCode',
    'recipe_code',
    'id',
  ]);
  if (nestedRecipeCandidate) {
    return nestedRecipeCandidate;
  }

  const metadataCandidate = getRecipeFieldCandidate(asset.metadata, [
    'recipeNumber',
    'recipe_number',
    'recipeCode',
    'recipe_code',
  ]);
  if (metadataCandidate) {
    return metadataCandidate;
  }

  const parsed = parseAdFilename(asset.filename || '');
  const parsedCandidate = normalizeRecipeIdentifier(parsed.recipeCode);
  if (parsedCandidate) {
    return parsedCandidate;
  }

  return '';
};

const normalizeAspectRatioCandidate = (value) => {
  const normalized = normalizeKeyPart(value);
  if (!normalized) return '';

  const sanitized = normalized.replace(/[:\s]/g, '').toLowerCase();
  if (!sanitized) {
    return '';
  }

  if (
    sanitized === '1x1' ||
    sanitized === 'square' ||
    sanitized === '1080x1080'
  ) {
    return '1x1';
  }

  if (
    sanitized === '4x5' ||
    sanitized === '45' ||
    sanitized === '1080x1350' ||
    sanitized === 'portrait'
  ) {
    return '4x5';
  }

  if (
    sanitized === '9x16' ||
    sanitized === '916' ||
    sanitized === '1080x1920' ||
    sanitized === 'vertical' ||
    sanitized === 'story'
  ) {
    return '9x16';
  }

  return normalized;
};

const buildApprovedAssetPayload = (asset) => {
  const docId = getAssetDocumentId(asset);
  const parsed = parseAdFilename(asset?.filename || '');
  const canonicalAspect =
    normalizeAspectRatioCandidate(asset?.aspectRatio) ||
    normalizeAspectRatioCandidate(parsed.aspectRatio);

  return {
    payload: {
      id: docId,
      filename: asset?.filename || '',
      status: asset?.status || '',
      firebaseUrl: asset?.firebaseUrl || '',
      cdnUrl: asset?.cdnUrl || '',
      thumbnailUrl: asset?.thumbnailUrl || '',
      aspectRatio: canonicalAspect || asset?.aspectRatio || '',
      recipeCode: asset?.recipeCode || '',
      version: getVersion(asset),
    },
    canonicalAspect: canonicalAspect || '',
  };
};

const selectPrimaryAssetPayload = (assetEntries) => {
  if (!assetEntries.length) {
    return null;
  }

  const priority = ['1x1', '4x5', '9x16'];
  for (const target of priority) {
    const match = assetEntries.find((entry) => entry.canonicalAspect === target);
    if (match && match.payload?.id) {
      return match.payload;
    }
  }

  const fallback = assetEntries.find((entry) => entry.payload?.id);
  return fallback ? fallback.payload : null;
};

const groupAssetsByRecipe = (assets) => {
  const groups = new Map();

  assets.forEach((asset) => {
    const docId = getAssetDocumentId(asset);
    if (!docId) {
      return;
    }

    const identifier = getAssetRecipeIdentifier(asset);
    const key = identifier || docId;
    const entry = groups.get(key);
    if (entry) {
      entry.assets.push(asset);
      entry.docIds.push(docId);
      if (!entry.identifier && identifier) {
        entry.identifier = identifier;
      }
      return;
    }

    groups.set(key, {
      key,
      identifier: identifier || '',
      assets: [asset],
      docIds: [docId],
    });
  });

  return Array.from(groups.values());
};

export const getAssetDocumentId = (asset) =>
  normalizeKeyPart(
    asset?.assetId ||
      asset?.id ||
      asset?.documentId ||
      asset?.docId ||
      asset?.originalAssetId ||
      asset?.originalId,
  );

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const DUPLICATE_MESSAGE_PATTERNS = [/duplicate/i, /already exists/i];

const collectCandidateMessages = (entry) => {
  const candidates = [];
  const pushCandidate = (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        candidates.push(trimmed);
      }
    }
  };

  if (!entry || typeof entry !== 'object') {
    pushCandidate(entry);
    return candidates;
  }

  pushCandidate(entry.errorMessage);
  pushCandidate(entry.message);
  pushCandidate(entry.error);

  const body = entry.body;
  if (body && typeof body === 'object') {
    pushCandidate(body.error);
    pushCandidate(body.message);
    pushCandidate(body.detail);
  } else {
    pushCandidate(body);
  }

  const response = entry.response;
  if (response && typeof response === 'object') {
    pushCandidate(response.errorMessage);
    pushCandidate(response.message);
    pushCandidate(response.error);

    const responseBody = response.body;
    if (responseBody && typeof responseBody === 'object') {
      pushCandidate(responseBody.error);
      pushCandidate(responseBody.message);
      pushCandidate(responseBody.detail);
    } else {
      pushCandidate(responseBody);
    }
  }

  return candidates;
};

const extractDuplicateConflictMessage = (dispatchEntry, parsedResponse) => {
  const candidates = collectCandidateMessages(dispatchEntry);

  if (parsedResponse && typeof parsedResponse === 'object') {
    candidates.push(...collectCandidateMessages(parsedResponse));
    if (parsedResponse.dispatch && typeof parsedResponse.dispatch === 'object') {
      candidates.push(...collectCandidateMessages(parsedResponse.dispatch));
    }
  }

  return (
    candidates.find((text) =>
      DUPLICATE_MESSAGE_PATTERNS.every((pattern) => pattern.test(text)),
    ) || ''
  );
};

export const isDuplicateConflictResponse = (statusCode, dispatchEntry, parsedResponse) =>
  statusCode === 409 && Boolean(extractDuplicateConflictMessage(dispatchEntry, parsedResponse));

export const updateIntegrationStatusForAssets = async (
  {
    groupId,
    integrationId,
    integrationName = '',
  },
  targetAssets,
  nextState,
  options = {},
) => {
  if (
    !groupId ||
    !integrationId ||
    !Array.isArray(targetAssets) ||
    targetAssets.length === 0
  ) {
    return;
  }

  const { errorMessage = '' } = options;
  const hasRequestPayload = hasOwn(options, 'requestPayload');
  const hasResponsePayload = hasOwn(options, 'responsePayload');
  const hasResponseStatus = hasOwn(options, 'responseStatus');
  const hasResponseHeaders = hasOwn(options, 'responseHeaders');

  try {
    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    let hasUpdates = false;

    targetAssets.forEach((asset) => {
      const docId = getAssetDocumentId(asset);
      if (!docId) {
        return;
      }
      const ref = doc(db, 'adGroups', groupId, 'assets', docId);
      const payload = {
        state: nextState,
        integrationId,
        integrationName: integrationName || '',
        updatedAt: timestamp,
      };
      if (nextState === 'error') {
        payload.errorMessage = errorMessage || '';
      } else {
        payload.errorMessage = '';
      }
      if (hasRequestPayload) {
        payload.requestPayload =
          options.requestPayload === undefined ? null : options.requestPayload;
      }
      if (hasResponsePayload) {
        payload.responsePayload =
          options.responsePayload === undefined ? null : options.responsePayload;
      }
      if (hasResponseStatus) {
        payload.responseStatus =
          options.responseStatus === undefined ? null : options.responseStatus;
      }
      if (hasResponseHeaders) {
        payload.responseHeaders =
          options.responseHeaders === undefined ? null : options.responseHeaders;
      }
      batch.update(ref, {
        [`integrationStatuses.${integrationId}`]: payload,
      });
      hasUpdates = true;
    });

    if (hasUpdates) {
      await batch.commit();
    }
  } catch (err) {
    console.error('Failed to update integration statuses', err);
  }
};

export const dispatchIntegrationForAssets = async ({
  groupId,
  integrationId,
  integrationName = '',
  assets,
}) => {
  if (!groupId || !integrationId) {
    return;
  }

  const assetsList = Array.isArray(assets)
    ? assets.filter((asset) => getAssetDocumentId(asset))
    : [];

  if (!assetsList.length) {
    return;
  }

  await updateIntegrationStatusForAssets(
    { groupId, integrationId, integrationName },
    assetsList,
    'sending',
    {
      requestPayload: null,
      responsePayload: null,
      responseStatus: null,
      responseHeaders: null,
      errorMessage: '',
    },
  );

  const errors = [];
  const groupedAssets = groupAssetsByRecipe(assetsList);

  for (let index = 0; index < groupedAssets.length; index += 1) {
    const group = groupedAssets[index];
    const attempt = index + 1;
    const assetEntries = group.assets.map((asset) => buildApprovedAssetPayload(asset));
    const approvedAssetsRaw = assetEntries
      .map((entry) => entry.payload)
      .filter((entry) => entry && entry.id);
    const normalizedRecipeIdentifier =
      normalizeRecipeIdentifier(group.identifier) ||
      approvedAssetsRaw
        .map((entry) => normalizeRecipeIdentifier(entry.recipeCode))
        .find((candidate) => candidate) ||
      '';
    const approvedAssets = approvedAssetsRaw.map((entry) => {
      if (!normalizedRecipeIdentifier) {
        return entry;
      }
      const normalizedEntryRecipe = normalizeRecipeIdentifier(entry.recipeCode);
      if (normalizedEntryRecipe === normalizedRecipeIdentifier) {
        return entry;
      }
      return {
        ...entry,
        recipeCode: normalizedRecipeIdentifier,
      };
    });
    const primaryAsset = selectPrimaryAssetPayload(assetEntries);
    const approvedAssetIds = approvedAssets.map((entry) => entry.id).filter(Boolean);
    const primaryAssetId = normalizeKeyPart(primaryAsset?.id);
    const normalizedPrimaryAsset =
      (primaryAssetId &&
        approvedAssets.find((entry) => normalizeKeyPart(entry.id) === primaryAssetId)) ||
      approvedAssets[0] ||
      null;

    if (approvedAssets.length === 0) {
      const message = 'No assets available for integration dispatch.';
      await updateIntegrationStatusForAssets(
        { groupId, integrationId, integrationName },
        group.assets,
        'error',
        {
          errorMessage: message,
          requestPayload: null,
          responsePayload: null,
          responseStatus: null,
          responseHeaders: null,
        },
      );
      errors.push({
        assetId: group.key,
        message,
      });
      continue;
    }

    const payload = {
      adGroupId: groupId,
      integrationId,
      integrationName: integrationName || '',
      recipeIdentifier: normalizedRecipeIdentifier,
      recipeCode: normalizedRecipeIdentifier,
      approvedAssetId: normalizedPrimaryAsset?.id || approvedAssetIds[0] || '',
      approvedAdId: normalizedPrimaryAsset?.id || approvedAssetIds[0] || '',
      approvedAssetIds,
      approvedAssets,
      approvedAsset: normalizedPrimaryAsset || null,
    };

    let responsePayloadSnapshot = null;
    let responseHeadersSnapshot = null;
    let responseStatusCode = null;
    let requestPayloadSnapshot = payload;
    let responseText = '';
    let parsedResponse = null;
    let errorHandled = false;

    try {
      const response = await fetch('/api/integration-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId,
          reviewId: groupId,
          attempt,
          payload,
        }),
      });

      const workerStatusCode = response.status;
      responseStatusCode = workerStatusCode;
      responseText = await response.text();
      if (responseText) {
        try {
          parsedResponse = JSON.parse(responseText);
        } catch (err) {
          parsedResponse = null;
        }
      }

      const statusEntry = parsedResponse?.dispatch;
      const duplicateConflict = isDuplicateConflictResponse(
        responseStatusCode,
        statusEntry,
        parsedResponse,
      );
      const statusState = normalizeKeyPart(statusEntry?.status).toLowerCase();
      const integrationErrorMessage = normalizeKeyPart(
        statusEntry?.errorMessage,
      );
      const headersEntry = parsedResponse?.dispatch?.response?.headers;

      responsePayloadSnapshot = parsedResponse || responseText || null;
      responseHeadersSnapshot = headersEntry || null;

      if (statusEntry && typeof statusEntry === 'object') {
        const dispatchStatusCode = toStatusCode(
          statusEntry.status ??
            statusEntry.statusCode ??
            statusEntry.response?.status ??
            statusEntry.response?.statusCode,
        );
        if (dispatchStatusCode !== null) {
          responseStatusCode = dispatchStatusCode;
        }
      }

      let responseStatusIsError = isErrorStatusCode(responseStatusCode);
      if (responseStatusIsError && duplicateConflict) {
        responseStatusIsError = false;
      }

      const responseFailedWithoutDuplicateConflict = !response.ok && !duplicateConflict;

      if (responseFailedWithoutDuplicateConflict || responseStatusIsError) {
        const message =
          integrationErrorMessage ||
          parsedResponse?.error ||
          statusEntry?.message ||
          response.statusText ||
          (responseStatusIsError
            ? `Integration responded with status ${responseStatusCode}.`
            : 'Integration request failed.');
        await updateIntegrationStatusForAssets(
          { groupId, integrationId, integrationName },
          group.assets,
          'error',
          {
            errorMessage: message,
            requestPayload: requestPayloadSnapshot,
            responsePayload: responsePayloadSnapshot,
            responseStatus: responseStatusCode,
            responseHeaders: responseHeadersSnapshot,
          },
        );
        errorHandled = true;
        errors.push({
          assetId: group.key,
          message,
        });
        continue;
      }

      if (statusState === 'error' || statusState === 'failed') {
        const message =
          integrationErrorMessage ||
          statusEntry?.message ||
          'Integration reported failure.';
        await updateIntegrationStatusForAssets(
          { groupId, integrationId, integrationName },
          group.assets,
          'error',
          {
            errorMessage: message,
            requestPayload: requestPayloadSnapshot,
            responsePayload: responsePayloadSnapshot,
            responseStatus: responseStatusCode,
            responseHeaders: responseHeadersSnapshot,
          },
        );
        errorHandled = true;
        errors.push({
          assetId: group.key,
          message,
        });
        continue;
      }

      await updateIntegrationStatusForAssets(
        { groupId, integrationId, integrationName },
        group.assets,
        'received',
        {
          requestPayload: requestPayloadSnapshot,
          responsePayload: responsePayloadSnapshot,
          responseStatus: responseStatusCode,
          responseHeaders: responseHeadersSnapshot,
          errorMessage: '',
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Integration dispatch failed.';
      if (!errorHandled) {
        await updateIntegrationStatusForAssets(
          { groupId, integrationId, integrationName },
          group.assets,
          'error',
          {
            errorMessage: message,
            requestPayload: requestPayloadSnapshot,
            responsePayload: responsePayloadSnapshot,
            responseStatus: responseStatusCode,
            responseHeaders: responseHeadersSnapshot,
          },
        );
      }
      errors.push({
        assetId: group.key,
        message,
      });
    }
  }

  if (errors.length > 0) {
    const combinedMessage = errors
      .map((entry) => `${entry.assetId || 'ad'}: ${entry.message}`)
      .join('; ');
    throw new Error(combinedMessage);
  }
};

export default dispatchIntegrationForAssets;
