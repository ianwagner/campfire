const normalizeBoolean = (value, defaultValue = false) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return defaultValue;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "object") {
    return defaultValue;
  }
  return defaultValue;
};

export default normalizeBoolean;
