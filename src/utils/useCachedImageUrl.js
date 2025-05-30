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
      setSrc(stored);
      return;
    }
    let active = true;
    toDataUrl(url)
      .then((dataUrl) => {
        if (!active) return;
        try {
          localStorage.setItem(key, dataUrl);
        } catch {}
        // Avoid flashing by keeping the current URL until the
        // cached version is used on the next load
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
