import React, { useEffect, useRef } from 'react';
import useCachedImageUrl from '../utils/useCachedImageUrl';

const OptimizedImage = ({
  pngUrl,
  webpUrl,
  alt = '',
  loading = 'lazy',
  cacheKey,
  ...props
}) => {
  const pngSrc = useCachedImageUrl(cacheKey, pngUrl);
  const webp = webpUrl || (pngUrl ? pngUrl.replace(/\.png$/, '.webp') : undefined);
  const webpSrc = webp ? useCachedImageUrl(`${cacheKey || webp}-webp`, webp) : null;

  const loadStartRef = useRef(null);

  useEffect(() => {
    if (pngSrc) {
      loadStartRef.current = performance.now();
      if (process.env.NODE_ENV !== 'production') {
        console.log('OptimizedImage src changed', pngSrc);
      }
    }
  }, [pngSrc]);
  return (
    <picture>
      {webpSrc && <source srcSet={webpSrc} type="image/webp" />}
      <img
        src={pngSrc}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => {
          if (process.env.NODE_ENV !== 'production') {
            const start = loadStartRef.current;
            const duration = start ? Math.round(performance.now() - start) : 0;
            console.log(
              'Image loaded:',
              alt || pngUrl,
              'duration:',
              `${duration}ms`
            );
          }
        }}
        {...props}
      />
    </picture>
  );
};

export default OptimizedImage;
