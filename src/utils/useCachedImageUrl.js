import { useEffect, useMemo } from 'react';
import debugLog from './debugLog';

const toDataUrl = async (url) => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const useCachedImageUrl = (key, url) => {
  const src = useMemo(() => {
    if (key) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          debugLog('Loaded cached image', key);
          return stored;
        }
      } catch {}
    }
    return url;
  }, [key, url]);

  useEffect(() => {
    if (!key || !url) return;

    try {
      const stored = localStorage.getItem(key);
      if (stored) return;
    } catch {}

    let active = true;
    toDataUrl(url)
      .then((dataUrl) => {
        if (!active) return;
        try {
          localStorage.setItem(key, dataUrl);
        } catch {}
        debugLog('Fetched image', url);
      })
      .catch(() => {
        console.error('Image fetch failed', url);
      });

    return () => {
      active = false;
    };
  }, [key, url]);

  return src;
};

export default useCachedImageUrl;
