import React from 'react';

// Generic table component that enforces stable layout. It uses
// `table-layout: fixed` and optionally renders a `<colgroup>` when
// column widths are provided. This prevents columns from resizing when
// cells switch to edit mode.
const Table = ({ children, className = '', columns = [] }) => (
  <div className="table-container">
    <table className={`ad-table w-full table-fixed text-sm ${className}`.trim()}>
      {columns.length > 0 && (
        <colgroup>
          {columns.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
        </colgroup>
      )}
      {children}
    </table>
  </div>
);

export default Table;
