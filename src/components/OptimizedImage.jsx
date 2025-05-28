import React from 'react';

const OptimizedImage = ({ pngUrl, webpUrl, alt = '', ...props }) => {
  const webp = webpUrl || (pngUrl ? pngUrl.replace(/\.png$/, '.webp') : undefined);
  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img src={pngUrl} alt={alt} loading="lazy" {...props} />
    </picture>
  );
};

export default OptimizedImage;
