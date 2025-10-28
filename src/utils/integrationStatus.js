const toStatusCode = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

const parseMaybeJson = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return null;
  }
};

const extractStatusFromPayload = (payload) => {
  const parsed = parseMaybeJson(payload);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidates = [];

  const pushCandidate = (value) => {
    const code = toStatusCode(value);
    if (code !== null) {
      candidates.push(code);
    }
  };

  const dispatchEntry =
    parsed && typeof parsed === "object" ? parsed.dispatch : undefined;

  if (dispatchEntry && typeof dispatchEntry === "object") {
    const responseEntry =
      typeof dispatchEntry.response === "object" && dispatchEntry.response
        ? dispatchEntry.response
        : null;

    if (responseEntry && typeof responseEntry === "object") {
      pushCandidate(responseEntry.status ?? responseEntry.statusCode);
    }

    pushCandidate(dispatchEntry.status ?? dispatchEntry.statusCode);
  }

  if (typeof parsed === "object") {
    const responseEntry =
      typeof parsed.response === "object" && parsed.response
        ? parsed.response
        : null;
    if (responseEntry && typeof responseEntry === "object") {
      pushCandidate(responseEntry.status ?? responseEntry.statusCode);
    }
  }

  pushCandidate(parsed.status ?? parsed.statusCode);

  if (!candidates.length) {
    return null;
  }

  return candidates[0];
};

export const isErrorStatusCode = (status) =>
  typeof status === "number" && status >= 400;

export const resolveIntegrationResponseStatus = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const payloadStatus = extractStatusFromPayload(entry.responsePayload);
  const directStatus = toStatusCode(entry.responseStatus);

  if (isErrorStatusCode(payloadStatus)) {
    return payloadStatus;
  }
  if (isErrorStatusCode(directStatus)) {
    return directStatus;
  }
  if (payloadStatus !== null) {
    return payloadStatus;
  }
  if (directStatus !== null) {
    return directStatus;
  }
  return null;
};

export { toStatusCode };

export default resolveIntegrationResponseStatus;
