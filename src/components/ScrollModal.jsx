import React from 'react';
import Modal from './Modal.jsx';

const ScrollModal = ({ header = null, sizeClass = 'max-w-lg w-full', className = '', style = {}, children }) => (
  <Modal sizeClass={sizeClass} className={className} style={{ maxHeight: '90vh', ...style }}>
    <div className="flex flex-col h-full">
      {header && (
        <div className="sticky top-0 bg-white dark:bg-[var(--dark-sidebar-bg)] z-10">
          {header}
        </div>
      )}
      <div className="overflow-y-auto flex-1">
        {children}
      </div>
    </div>
  </Modal>
);

export default ScrollModal;
