import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import getVersion from "./getVersion";
import { db } from "../firebase/config";

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value);
};

const getAssetDocumentId = (asset) =>
  normalizeKeyPart(
    asset?.assetId ||
      asset?.id ||
      asset?.documentId ||
      asset?.docId ||
      asset?.originalAssetId ||
      asset?.originalId,
  );

const updateIntegrationStatusForAssets = async (
  groupId,
  integrationId,
  integrationName,
  assets,
  nextState,
  options = {},
) => {
  if (
    !groupId ||
    !integrationId ||
    !Array.isArray(assets) ||
    assets.length === 0
  ) {
    return;
  }

  const hasRequestPayload = Object.prototype.hasOwnProperty.call(
    options,
    "requestPayload",
  );
  const hasResponsePayload = Object.prototype.hasOwnProperty.call(
    options,
    "responsePayload",
  );
  const hasResponseStatus = Object.prototype.hasOwnProperty.call(
    options,
    "responseStatus",
  );
  const hasResponseHeaders = Object.prototype.hasOwnProperty.call(
    options,
    "responseHeaders",
  );
  const errorMessage = options.errorMessage || "";

  try {
    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    let hasUpdates = false;

    assets.forEach((asset) => {
      const docId = getAssetDocumentId(asset);
      if (!docId) {
        return;
      }
      const ref = doc(db, "adGroups", groupId, "assets", docId);
      const payload = {
        state: nextState,
        integrationId,
        integrationName: integrationName || "",
        updatedAt: timestamp,
        errorMessage: nextState === "error" ? errorMessage : "",
      };

      if (hasRequestPayload) {
        payload.requestPayload =
          options.requestPayload === undefined ? null : options.requestPayload;
      }
      if (hasResponsePayload) {
        payload.responsePayload =
          options.responsePayload === undefined
            ? null
            : options.responsePayload;
      }
      if (hasResponseStatus) {
        payload.responseStatus =
          options.responseStatus === undefined ? null : options.responseStatus;
      }
      if (hasResponseHeaders) {
        payload.responseHeaders =
          options.responseHeaders === undefined
            ? null
            : options.responseHeaders;
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
    console.error("Failed to update integration statuses", err);
  }
};

const fetchApprovedAssets = async (groupId) => {
  const snapshot = await getDocs(collection(db, "adGroups", groupId, "assets"));
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((asset) => asset?.status === "approved");
};

const resolveIntegrationDetails = async (groupId) => {
  const snap = await getDoc(doc(db, "adGroups", groupId));
  if (!snap.exists()) {
    return { integrationId: "", integrationName: "" };
  }
  const data = snap.data() || {};
  return {
    integrationId:
      typeof data.assignedIntegrationId === "string"
        ? data.assignedIntegrationId
        : "",
    integrationName:
      typeof data.assignedIntegrationName === "string"
        ? data.assignedIntegrationName
        : "",
  };
};

const mapApprovedAssets = (assets) =>
  assets
    .filter((asset) => asset && typeof asset === "object")
    .filter((asset) => asset.status === "approved")
    .map((asset) => ({
      ...asset,
      id: getAssetDocumentId(asset) || asset?.id || "",
    }))
    .filter((asset) => asset.id);

export const runIntegrationForAdGroup = async (
  groupId,
  options = {},
) => {
  if (!groupId) return;

  const {
    assets: providedAssets,
    integrationId: initialIntegrationId,
    integrationName: initialIntegrationName,
  } = options;

  let integrationId =
    typeof initialIntegrationId === "string" ? initialIntegrationId : "";
  let integrationName =
    typeof initialIntegrationName === "string" ? initialIntegrationName : "";

  if (!integrationId) {
    const details = await resolveIntegrationDetails(groupId);
    integrationId = details.integrationId;
    if (!integrationName) {
      integrationName = details.integrationName;
    }
  }

  if (!integrationId) {
    return;
  }

  let assetsList = Array.isArray(providedAssets)
    ? mapApprovedAssets(providedAssets)
    : null;

  if (!assetsList) {
    const fetchedAssets = await fetchApprovedAssets(groupId);
    assetsList = mapApprovedAssets(fetchedAssets);
  } else {
    assetsList = assetsList.filter((asset) => asset.status === "approved");
  }

  if (!assetsList.length) {
    return;
  }

  await updateIntegrationStatusForAssets(
    groupId,
    integrationId,
    integrationName,
    assetsList,
    "sending",
    {
      requestPayload: null,
      responsePayload: null,
      responseStatus: null,
      responseHeaders: null,
      errorMessage: "",
    },
  );

  const payload = {
    adGroupId: groupId,
    integrationId,
    integrationName: integrationName || "",
    approvedAssetIds: assetsList.map((asset) => asset.id),
    approvedAssets: assetsList.map((asset) => ({
      id: asset.id,
      filename: asset.filename || "",
      status: asset.status || "",
      firebaseUrl: asset.firebaseUrl || "",
      cdnUrl: asset.cdnUrl || "",
      thumbnailUrl: asset.thumbnailUrl || "",
      aspectRatio: asset.aspectRatio || "",
      recipeCode: asset.recipeCode || "",
      version: getVersion(asset),
    })),
  };

  let requestPayloadSnapshot = payload;
  let responsePayloadSnapshot = null;
  let responseHeadersSnapshot = null;
  let responseStatusCode = null;
  let responseText = "";
  let parsedResponse = null;
  let errorHandled = false;

  try {
    const response = await fetch("/api/integration-worker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integrationId,
        reviewId: groupId,
        attempt: 1,
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

    if (parsedResponse && typeof parsedResponse === "object") {
      if (
        parsedResponse.request &&
        typeof parsedResponse.request === "object" &&
        parsedResponse.request !== null &&
        Object.prototype.hasOwnProperty.call(parsedResponse.request, "body")
      ) {
        requestPayloadSnapshot = parsedResponse.request.body;
      } else if (
        parsedResponse.mapping &&
        typeof parsedResponse.mapping === "object" &&
        parsedResponse.mapping !== null &&
        Object.prototype.hasOwnProperty.call(parsedResponse.mapping, "payload")
      ) {
        requestPayloadSnapshot = parsedResponse.mapping.payload;
      }

      if (
        parsedResponse.dispatch &&
        typeof parsedResponse.dispatch === "object" &&
        parsedResponse.dispatch !== null
      ) {
        const dispatchData = parsedResponse.dispatch;
        if (Object.prototype.hasOwnProperty.call(dispatchData, "body")) {
          responsePayloadSnapshot = dispatchData.body;
        }
        if (Object.prototype.hasOwnProperty.call(dispatchData, "headers")) {
          responseHeadersSnapshot = dispatchData.headers;
        }
        if (
          Object.prototype.hasOwnProperty.call(dispatchData, "status") &&
          typeof dispatchData.status === "number"
        ) {
          responseStatusCode = dispatchData.status;
        }
      }
    }

    if (responsePayloadSnapshot === null && responseText) {
      try {
        responsePayloadSnapshot = JSON.parse(responseText);
      } catch (err) {
        responsePayloadSnapshot = responseText;
      }
    }

    if (responseStatusCode === null) {
      responseStatusCode = response.status;
    }

    if (!response.ok) {
      const message = (() => {
        if (parsedResponse && typeof parsedResponse === "object") {
          if (typeof parsedResponse.error === "string") {
            return parsedResponse.error;
          }
          if (typeof parsedResponse.message === "string") {
            return parsedResponse.message;
          }
        }
        return response.statusText || "Integration request failed.";
      })();

      errorHandled = true;
      await updateIntegrationStatusForAssets(
        groupId,
        integrationId,
        integrationName,
        assetsList,
        "error",
        {
          errorMessage: message,
          requestPayload: requestPayloadSnapshot,
          responsePayload: responsePayloadSnapshot,
          responseStatus: responseStatusCode,
          responseHeaders: responseHeadersSnapshot,
        },
      );
      throw new Error(message);
    }

    await updateIntegrationStatusForAssets(
      groupId,
      integrationId,
      integrationName,
      assetsList,
      "received",
      {
        requestPayload: requestPayloadSnapshot,
        responsePayload: responsePayloadSnapshot,
        responseStatus: responseStatusCode,
        responseHeaders: responseHeadersSnapshot,
        errorMessage: "",
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Integration dispatch failed.";
    if (!errorHandled) {
      await updateIntegrationStatusForAssets(
        groupId,
        integrationId,
        integrationName,
        assetsList,
        "error",
        {
          errorMessage: message,
          requestPayload: requestPayloadSnapshot,
          responsePayload: responsePayloadSnapshot,
          responseStatus: responseStatusCode,
          responseHeaders: responseHeadersSnapshot,
        },
      );
    }
    throw error;
  }
};

export default runIntegrationForAdGroup;
