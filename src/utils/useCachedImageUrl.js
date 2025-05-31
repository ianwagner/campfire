import { useState, useEffect } from 'react';
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

export const cacheImageUrl = async (key, url) => {
  if (!key || !url) return null;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
  } catch {}
  try {
    const dataUrl = await toDataUrl(url);
    try {
      localStorage.setItem(key, dataUrl);
    } catch {}
    debugLog('Fetched image', url);
    return dataUrl;
  } catch (err) {
    console.error('Image fetch failed', url);
    return null;
  }
};

const useCachedImageUrl = (key, url) => {
  const [src, setSrc] = useState(() => {
    if (key) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) return stored;
      } catch {}
    }
    return url;
  });

  useEffect(() => {
    if (!key || !url) {
      setSrc(url);
      return;
    }
    const stored = localStorage.getItem(key);
    if (stored) {
      debugLog('Loaded cached image', key);
      setSrc(stored);
      return;
    }
    let active = true;
    cacheImageUrl(key, url)
      .then((dataUrl) => {
        if (active && dataUrl) setSrc(dataUrl);
        else if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc(url);
      });
    return () => {
      active = false;
    };
  }, [key, url]);

  return src;
};

export default useCachedImageUrl;
