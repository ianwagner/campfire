import React from 'react';

const OptimizedImage = ({ webpUrl, pngUrl, alt, ...props }) => (
  <picture>
    <source srcSet={webpUrl} type="image/webp" />
    <img src={pngUrl} alt={alt} loading="lazy" {...props} />
  </picture>
);

export default OptimizedImage;
