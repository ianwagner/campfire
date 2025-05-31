import React from 'react';
import useCachedImageUrl from '../utils/useCachedImageUrl';

const isHosted = (url) => /^https?:\/\//i.test(url || '');
const isDataUri = (url) => /^data:/i.test(url || '');

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

  const renderWebp = webpSrc && isHosted(webpSrc) && !isDataUri(webpSrc);
  if (webpSrc && isDataUri(webpSrc)) {
    console.warn('Blocked data URI in <source> srcset', webpSrc);
  }

  const imgSrc = isHosted(pngSrc) ? pngSrc : pngUrl;

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
