function normalizeAudience(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized === "internal" || normalized === "external") {
    return normalized;
  }

  const collapsed = normalized.replace(/[\s_-]+/g, "");

  if (collapsed === "internal" || collapsed === "internalonly") {
    return "internal";
  }

  if (collapsed === "external" || collapsed === "externalonly") {
    return "external";
  }

  return "";
}

module.exports = {
  normalizeAudience,
};
