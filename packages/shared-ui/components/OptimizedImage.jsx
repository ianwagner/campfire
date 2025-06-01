import React from 'react';
import useCachedImageUrl from '../utils/useCachedImageUrl';
import sanitizeSrc from '../utils/sanitizeSrc';

const isHosted = (url) => /^https?:\/\//i.test(url || '');

const OptimizedImage = ({
  pngUrl,
  webpUrl,
  alt = '',
  loading = 'lazy',
  cacheKey,
  ...props
}) => {
  const pngRaw = useCachedImageUrl(cacheKey, pngUrl);
  const webp = webpUrl || (pngUrl ? pngUrl.replace(/\.png$/, '.webp') : undefined);
  const webpRaw = webp ? useCachedImageUrl(`${cacheKey || webp}-webp`, webp) : null;

  const imgSrc = sanitizeSrc(isHosted(pngRaw) ? pngRaw : pngUrl);
  const webpSrc = sanitizeSrc(isHosted(webpRaw) ? webpRaw : null);

  const renderWebp = Boolean(webpSrc);

  if (renderWebp) {
    return (
      <picture>
        <source srcSet={webpSrc} type="image/webp" />
        <img src={imgSrc} alt={alt} loading={loading} decoding="async" {...props} />
      </picture>
    );
  }

  return <img src={imgSrc} alt={alt} loading={loading} decoding="async" {...props} />;
};

export default OptimizedImage;
