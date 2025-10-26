// This utility previously stored images in localStorage to speed up
// subsequent loads. Caching has been removed, but we keep the API
// surface in case components still import these helpers.

import sanitizeSrc from './sanitizeSrc';

export const cacheImageUrl = async (_key, url) => {
  if (!url) return null;
  const sanitized = sanitizeSrc(url);
  if (!sanitized) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(sanitized);
    img.onerror = () => resolve(null);
    img.src = sanitized;
  });
};

const useCachedImageUrl = (_key, url) => url || null;
export default useCachedImageUrl;
