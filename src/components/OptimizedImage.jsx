import React from 'react';
import sanitizeSrc from '../utils/sanitizeSrc';

const OptimizedImage = ({
  pngUrl,
  webpUrl,
  alt = '',
  loading = 'lazy',
  cacheKey,
  ...props
}) => {
  const imgSrc = sanitizeSrc(pngUrl);
  const webpSrc = sanitizeSrc(
    webpUrl || (pngUrl ? pngUrl.replace(/\.png$/, '.webp') : undefined)
  );

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
