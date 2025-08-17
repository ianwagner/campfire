import React, { useEffect, useRef, useState } from 'react';

// Generic table component that enforces stable layout. It uses
// `table-layout: fixed` and optionally renders a `<colgroup>` when
// column widths are provided. This prevents columns from resizing when
// cells switch to edit mode. The component now automatically sizes the
// final "actions" column based on the number of action buttons in each
// row so that buttons do not wrap unexpectedly.
const Table = ({ children, className = '', columns = [] }) => {
  const tableRef = useRef(null);
  const [actionsWidth, setActionsWidth] = useState(null);

  useEffect(() => {
    const calculateWidth = () => {
      const el = tableRef.current;
      if (!el) return;
      // When viewport is narrow allow the actions to stack vertically
      if (window.innerWidth <= 1000) {
        setActionsWidth(null);
        return;
      }
      const rows = el.querySelectorAll('tbody tr');
      let maxActions = 0;
      rows.forEach((row) => {
        const btns = row.querySelectorAll('td:last-child button, td:last-child a');
        if (btns.length > maxActions) {
          maxActions = btns.length;
        }
      });
      if (maxActions > 0) {
        // Approximate each action button at 2.5rem including spacing
        setActionsWidth(`${maxActions * 2.5}rem`);
      } else {
        setActionsWidth(null);
      }
    };

    calculateWidth();
    window.addEventListener('resize', calculateWidth);
    return () => window.removeEventListener('resize', calculateWidth);
  }, [children]);

  const colWidths = columns.map((width, i) =>
    actionsWidth && i === columns.length - 1 ? actionsWidth : width,
  );

  return (
    <div
      className={`table-container overflow-x-auto rounded-md border border-[var(--table-border-color)] bg-white dark:bg-[var(--dark-sidebar-bg)]`}
      style={{ overflowY: 'visible' }}
    >
      <table
        ref={tableRef}
        className={`ad-table w-full table-fixed text-sm ${className}`.trim()}
        style={actionsWidth ? { '--actions-col-width': actionsWidth } : undefined}
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
