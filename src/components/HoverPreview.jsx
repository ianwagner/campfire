import React from 'react';

const HoverPreview = ({ preview, placement = 'right', className = '', children }) => {
  const posClass =
    placement === 'left' ? 'right-full mr-2' : 'left-full ml-2';
  return (
    <span className={`relative inline-block group ${className}`.trim()}>
      {children}
      <div
        className={`hidden group-hover:block absolute ${posClass} top-1/2 -translate-y-1/2 p-1 border shadow-lg z-10 bg-white dark:bg-[var(--dark-sidebar-bg)]`}
      >
        <div className="min-h-[15rem] max-h-[25rem] flex items-center justify-center overflow-auto">
          {preview}
        </div>
      </div>
    </span>
  );
};

export default HoverPreview;
