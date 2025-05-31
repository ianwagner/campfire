import { useState, useEffect } from 'react';

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
  const [src, setSrc] = useState(() => {
    if (key) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('useCachedImageUrl cache hit', key);
          }
          return stored;
        }
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('useCachedImageUrl cache hit', key);
      }
      setSrc(stored);
      return;
    }
    let active = true;
    if (process.env.NODE_ENV !== 'production') {
      console.log('useCachedImageUrl fetching', key);
    }
    toDataUrl(url)
      .then((dataUrl) => {
        if (!active) return;
        try {
          localStorage.setItem(key, dataUrl);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('useCachedImageUrl failed to store', key, err);
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('useCachedImageUrl stored', key);
        }
        // Apply the cached data URL immediately to minimize flashing
        setSrc(dataUrl);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('useCachedImageUrl failed to fetch', key, err);
        }
        if (active) setSrc(url);
      });
    return () => {
      active = false;
    };
  }, [key, url]);

  return src;
};

export default useCachedImageUrl;
