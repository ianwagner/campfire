import React from 'react';
import Modal from './Modal.jsx';

/**
 * ScrollableModal wraps content in a Modal with a sticky header area and
 * scrollable body. The header should be passed via the `header` prop.
 */
const ScrollableModal = ({
  header,
  children,
  sizeClass = 'max-w-none',
  style = {},
}) => (
  <Modal
    sizeClass={sizeClass}
    style={{ minWidth: '700px', maxHeight: '500px', overflow: 'scroll', ...style }}
  >
    <div className="flex flex-col h-full">
      {header && (
        <div className="sticky top-0 bg-white dark:bg-[var(--dark-sidebar-bg)] flex items-start justify-between p-2 z-10">
          {header}
        </div>
      )}
      <div className="overflow-y-auto flex-1 space-y-2 p-2">{children}</div>
    </div>
  </Modal>
);

export default ScrollableModal;
