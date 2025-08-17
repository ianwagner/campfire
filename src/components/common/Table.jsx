import React from 'react';

// Generic table component that enforces stable layout. It uses
// `table-layout: fixed` and optionally renders a `<colgroup>` when
// column widths are provided. This prevents columns from resizing when
// cells switch to edit mode. The final "actions" column has a fixed
// width so that action buttons stack without the column growing.
const Table = ({ children, className = '', columns = [] }) => {
  const actionsWidth = '2.5rem';

  const colWidths = columns.map((width, i) =>
    i === columns.length - 1 ? actionsWidth : width,
  );

  return (
    <div className={`table-container overflow-hidden rounded-md bg-white dark:bg-[var(--dark-sidebar-bg)]`}>
      <table
        className={`ad-table w-full table-fixed text-sm ${className}`.trim()}
        style={{ '--actions-col-width': actionsWidth }}
      >
        {columns.length > 0 && (
          <colgroup>
            {colWidths.map((width, i) => (
              <col key={i} style={{ width }} />
            ))}
          </colgroup>
        )}
        {children}
      </table>
    </div>
  );
};

export default Table;
