import React from 'react';

const Table = ({ children }) => (
  <div className="overflow-x-auto table-container">
    <table className="ad-table w-full table-fixed text-sm">{children}</table>
  </div>
);

export default Table;
