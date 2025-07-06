import React from 'react';

const IconButton = ({ as: Component = 'button', className = '', children, ...props }) => (
  <Component
    type={Component === 'button' ? 'button' : undefined}
    {...props}
    className={`btn-secondary px-2 py-0.5 flex items-center gap-1 ${className}`}
  >
    {children}
  </Component>
);

export default IconButton;
