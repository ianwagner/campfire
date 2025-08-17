import React from 'react';

const Modal = ({
  children,
  sizeClass = 'max-w-md w-full',
  className = '',
  style = {},
}) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4 overflow-hidden">
    <div
      className={`bg-white p-4 rounded-xl shadow ${sizeClass} ${className} dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]`}
      style={style}
    >
      {children}
    </div>
  </div>
);

export default Modal;
