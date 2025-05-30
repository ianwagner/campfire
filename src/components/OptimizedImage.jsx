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
  return (
    <picture>
      {webpSrc && <source srcSet={webpSrc} type="image/webp" />}
      <img src={pngSrc} alt={alt} loading={loading} decoding="async" {...props} />
    </picture>
  );
};

export default OptimizedImage;
