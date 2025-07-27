import React from 'react';
import Modal from './Modal.jsx';

const ScrollModal = ({
  header = null,
  sizeClass = 'max-w-xl w-full',
  className = '',
  style = {},
  children,
}) => (
  <Modal
    sizeClass={sizeClass}
    className={`flex flex-col ${className}`}
    style={{ maxHeight: '90vh', overflow: 'hidden', ...style }}
  >
    {header && (
      <div className="sticky top-0 bg-white dark:bg-[var(--dark-sidebar-bg)] z-10">
        {header}
      </div>
    )}
    <div className="overflow-y-auto flex-1">
      {children}
    </div>
  </Modal>
);

export default ScrollModal;
