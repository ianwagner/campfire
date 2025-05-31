import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

/**
 * Wrapper around OptimizedImage that logs mount/unmount events and
 * guards against missing image URLs.
 */
const ReviewAd = ({ pngUrl, webpUrl, ...props }) => {
  const url = pngUrl || webpUrl;
  if (!url) return null;
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('ReviewAd mount', url);
    }
    return () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('ReviewAd unmount', url);
      }
    };
  }, [url]);
  return <OptimizedImage pngUrl={pngUrl} webpUrl={webpUrl} {...props} />;
};

export default ReviewAd;
