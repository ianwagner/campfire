import React from 'react';

const TabButton = React.forwardRef(
  ({ active, className = '', children, ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      className={`px-3 py-1 rounded flex items-center gap-1 transition-colors duration-200 ${
        active ? 'bg-accent-10 text-accent' : 'border'
      } ${className}`.trim()}
    >
      {children}
    </button>
  )
);

export default TabButton;
