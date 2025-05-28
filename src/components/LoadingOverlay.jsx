import React from 'react';

const LoadingOverlay = () => (
  <div className="loading-overlay" data-testid="loading-overlay">
    <div className="loading-spinner" aria-label="Loading" />
  </div>
);

export default LoadingOverlay;
