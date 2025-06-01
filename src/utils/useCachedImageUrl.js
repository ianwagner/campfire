// This utility previously stored images in localStorage to speed up
// subsequent loads. Caching has been removed, but we keep the API
// surface in case components still import these helpers.

export const cacheImageUrl = async (_key, url) => {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

const useCachedImageUrl = (_key, url) => url || null;
export default useCachedImageUrl;
