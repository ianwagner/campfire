// Accessing document in a module can break when this file is required in a
// non-browser environment (e.g. unit tests).  Compute the default color lazily
// so importing modules never throws if `document` is undefined.
export const DEFAULT_ACCENT_COLOR = (() => {
  if (typeof document === 'undefined') return '#ea580c';
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-color')
    .trim();
  return val || '#ea580c';
})();
