import React from 'react';

const Table = ({ children, className = '' }) => (
  <div className="overflow-x-auto table-container">
    <table className={`ad-table w-full min-w-max text-sm ${className}`.trim()}>{children}</table>
  </div>
);

export default Table;
