function getRequestSearchParams(req) {
  const combinedSearchParams = new URLSearchParams();

  const appendParams = (params) => {
    if (!params) {
      return;
    }

    for (const [key, value] of params.entries()) {
      if (typeof value === "string" && value.length) {
        if (!combinedSearchParams.has(key)) {
          combinedSearchParams.append(key, value);
        }
      }
    }
  };

  const protoHeader = req.headers?.["x-forwarded-proto"] || "https";
  const protocol = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader.split(",")[0];
  const host =
    req.headers?.host ||
    (Array.isArray(req.headers?.["x-forwarded-host"])
      ? req.headers["x-forwarded-host"][0]
      : req.headers?.["x-forwarded-host"]) ||
    "localhost";
  const baseUrl = `${protocol}://${host}`;

  const candidateUrls = [];

  const pushHeaderValue = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) candidateUrls.push(item);
      });
    } else {
      candidateUrls.push(value);
    }
  };

  if (typeof req.url === "string") {
    candidateUrls.push(req.url);
  }

  if (typeof req.originalUrl === "string") {
    candidateUrls.push(req.originalUrl);
  }

  pushHeaderValue(req.headers?.["x-vercel-forwarded-url"]);
  pushHeaderValue(req.headers?.["x-forwarded-url"]);
  pushHeaderValue(req.headers?.["x-forwarded-uri"]);
  pushHeaderValue(req.headers?.["x-original-url"]);

  for (const candidate of candidateUrls) {
    try {
      const parsedUrl = new URL(candidate, baseUrl);
      appendParams(parsedUrl.searchParams);
    } catch (parseError) {
      console.error("Failed to parse request URL candidate", {
        candidate,
        error: parseError?.message,
      });
    }
  }

  if (req.query && typeof req.query === "object") {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        const firstValid = value.find(
          (item) => typeof item === "string" && item.length
        );
        if (firstValid && !combinedSearchParams.has(key)) {
          combinedSearchParams.append(key, firstValid);
        }
      } else if (typeof value === "string" && value.length) {
        if (!combinedSearchParams.has(key)) {
          combinedSearchParams.append(key, value);
        }
      }
    }
  }

  return combinedSearchParams;
}

function resolveQueryParam(req, searchParams, key) {
  if (searchParams.has(key)) {
    const value = searchParams.get(key);
    if (value && value !== "undefined" && value !== "null") {
      return value;
    }
    return undefined;
  }

  const fallback = req.query?.[key];
  if (Array.isArray(fallback)) {
    return fallback.find(
      (item) => item && item !== "undefined" && item !== "null"
    );
  }

  if (
    typeof fallback === "string" &&
    fallback &&
    fallback !== "undefined" &&
    fallback !== "null"
  ) {
    return fallback;
  }

  return undefined;
}

module.exports = {
  getRequestSearchParams,
  resolveQueryParam,
};
