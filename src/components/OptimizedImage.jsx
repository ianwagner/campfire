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
  className = '',
  ...props
}) => {
  const png = typeof pngUrl === 'string' ? pngUrl : '';
  const pngRaw = useCachedImageUrl(cacheKey, png);
  const webp =
    typeof webpUrl === 'string'
      ? webpUrl
      : typeof png === 'string' && png.toLowerCase().endsWith('.png')
      ? png.replace(/\.png$/, '.webp')
      : undefined;
  const webpRaw = webp ? useCachedImageUrl(`${cacheKey || webp}-webp`, webp) : null;

  const imgSrc = sanitizeSrc(isHosted(pngRaw) ? pngRaw : png);
  const webpSrc = sanitizeSrc(isHosted(webpRaw) ? webpRaw : null);

  const renderWebp = Boolean(webpSrc);

  if (renderWebp) {
    return (
      <picture className={className}>
        <source srcSet={webpSrc} type="image/webp" />
        <img
          src={imgSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          className={className}
          {...props}
        />
      </picture>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      {...props}
    />
  );
};

export default OptimizedImage;
