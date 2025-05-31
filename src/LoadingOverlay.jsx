import React from 'react';

const LoadingOverlay = ({ visible = true, text = 'Loading...', className = '' }) => {
  if (!visible) return null;
  return (
    <div className={`loading-overlay ${className}`.trim()} data-testid="loading-overlay">
      <div className="flex flex-col items-center space-y-4">
        <div className="loading-ring" />
        {text && <div>{text}</div>}
      </div>
    </div>
  );
};

export default LoadingOverlay;
