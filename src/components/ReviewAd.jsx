import React, { useEffect } from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const ReviewAd = (props) => {
  useEffect(() => {
    console.log('mount', props.src);
    return () => console.log('unmount', props.src);
  }, []);
  return <OptimizedImage {...props} />;
};

export default ReviewAd;
