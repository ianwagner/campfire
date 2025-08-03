import React from 'react';

const Table = ({ children, className = '' }) => (
  <div className="table-container">
    <table className={`ad-table w-full table-auto text-sm ${className}`.trim()}>{children}</table>
  </div>
);

export default Table;
