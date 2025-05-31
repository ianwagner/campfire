import React from 'react';
import useCachedImageUrl from '../utils/useCachedImageUrl';

const isRealUrl = (url) => /^https?:\/\//.test(url);

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

  const hasWebp = webpSrc && isRealUrl(webpSrc);

  if (hasWebp) {
    return (
      <picture>
        <source srcSet={webpSrc} type="image/webp" />
        <img src={pngSrc} alt={alt} loading={loading} decoding="async" {...props} />
      </picture>
    );
  }

  return (
    <img src={pngSrc} alt={alt} loading={loading} decoding="async" {...props} />
  );
};

export default OptimizedImage;
