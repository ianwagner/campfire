import React from 'react';

const PageWrapper = ({ title, children, className = '' }) => (
  <div className={`min-h-screen p-4 ${className}`}>
    {title && <h1 className="text-2xl mb-4">{title}</h1>}
    {children}
  </div>
);

export default PageWrapper;
