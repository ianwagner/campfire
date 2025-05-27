export const DEFAULT_ACCENT_COLOR =
  getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-color')
    .trim() || '#ea580c';
