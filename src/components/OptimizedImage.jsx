import React from 'react';
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
  const loadStartRef = React.useRef(performance.now());

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('OptimizedImage src updated', alt || pngUrl, pngSrc);
    }
    loadStartRef.current = performance.now();
  }, [pngSrc, alt, pngUrl]);
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
            const dur = Math.round(performance.now() - loadStartRef.current);
            console.log('Image loaded:', alt || pngUrl, 'in', dur, 'ms');
          }
        }}
        {...props}
      />
    </picture>
  );
};

export default OptimizedImage;
