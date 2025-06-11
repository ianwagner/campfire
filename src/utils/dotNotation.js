export function flattenObject(obj, prefix = '') {
  const result = {};
  Object.entries(obj || {}).forEach(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, path));
    } else {
      result[path] = val;
    }
  });
  return result;
}

export function unflattenObject(obj) {
  const result = {};
  Object.entries(obj || {}).forEach(([key, val]) => {
    const parts = key.split('.');
    let cur = result;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== 'object') {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = val;
  });
  return result;
}
