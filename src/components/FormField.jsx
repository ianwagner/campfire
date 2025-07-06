import React from 'react';

const FormField = ({ label, children, className = '' }) => (
  <div className={className}>
    <label className="block mb-1 text-sm font-medium">{label}</label>
    {children}
  </div>
);

export default FormField;
