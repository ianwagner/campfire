import React from "react";

const IconButton = ({ as: Component = 'button', className = '', ...props }) => {
  return (
    <Component
      className={`btn-secondary px-2 py-0.5 flex items-center gap-1 ${className}`.trim()}
      {...props}
    />
  );
};

export default IconButton;
