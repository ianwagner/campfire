import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import getVersion from './getVersion';

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
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

  for (let index = 0; index < assetsList.length; index += 1) {
    const asset = assetsList[index];
    const assetId = getAssetDocumentId(asset);
    const attempt = index + 1;

    const approvedAsset = {
      id: assetId,
      filename: asset.filename || '',
      status: asset.status || '',
      firebaseUrl: asset.firebaseUrl || '',
      cdnUrl: asset.cdnUrl || '',
      thumbnailUrl: asset.thumbnailUrl || '',
      aspectRatio: asset.aspectRatio || '',
      recipeCode: asset.recipeCode || '',
      version: getVersion(asset),
    };

    const payload = {
      adGroupId: groupId,
      integrationId,
      integrationName: integrationName || '',
      approvedAssetId: assetId,
      approvedAdId: assetId,
      approvedAssetIds: assetId ? [assetId] : [],
      approvedAssets: [approvedAsset],
      approvedAsset,
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

      responseStatusCode = response.status;
      responseText = await response.text();
      if (responseText) {
        try {
          parsedResponse = JSON.parse(responseText);
        } catch (err) {
          parsedResponse = null;
        }
      }

      const statusEntry = parsedResponse?.dispatch;
      const statusState = normalizeKeyPart(statusEntry?.status).toLowerCase();
      const integrationErrorMessage = normalizeKeyPart(
        statusEntry?.errorMessage,
      );
      const headersEntry = parsedResponse?.dispatch?.response?.headers;

      responsePayloadSnapshot = parsedResponse || responseText || null;
      responseHeadersSnapshot = headersEntry || null;

      if (!response.ok) {
        const message =
          integrationErrorMessage ||
          parsedResponse?.error ||
          response.statusText ||
          'Integration request failed.';
        await updateIntegrationStatusForAssets(
          { groupId, integrationId, integrationName },
          [asset],
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
          assetId,
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
          [asset],
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
          assetId,
          message,
        });
        continue;
      }

      await updateIntegrationStatusForAssets(
        { groupId, integrationId, integrationName },
        [asset],
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
          [asset],
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
        assetId,
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
