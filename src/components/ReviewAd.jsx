import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

/**
 * Wrapper around OptimizedImage that logs mount/unmount events and
 * guards against missing image URLs.
 */
const ReviewAd = ({ pngUrl, webpUrl, ...props }) => {
  const url = pngUrl || webpUrl;
  if (!url) return null;
  return <OptimizedImage pngUrl={pngUrl} webpUrl={webpUrl} {...props} />;
};

export default ReviewAd;
