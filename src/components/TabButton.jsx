import React from 'react';

const TabButton = ({ active, className = '', children, ...props }) => (
  <button
    {...props}
    className={`px-3 py-1 rounded flex items-center gap-1 transition-colors duration-200 ${
      active ? 'bg-accent-10 text-accent' : 'border'
    } ${className}`.trim()}
  >
    {children}
  </button>
);

export default TabButton;
