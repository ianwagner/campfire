import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const HoverPreview = ({
  preview,
  placement = 'right',
  className = '',
  children,
  offset = 8,
}) => {
  const wrapperRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [show, setShow] = useState(false);

  const handleEnter = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = rect.top + rect.height / 2;
    const left =
      placement === 'left'
        ? rect.left - offset
        : rect.right + offset;
    setPos({ top, left });
    setShow(true);
  };

  const handleLeave = () => setShow(false);

  const previewEl = (
    <div
      className="fixed z-50 top-0 left-0 p-1 border shadow-lg bg-white dark:bg-[var(--dark-sidebar-bg)]"
      style={{ transform: `translate(${pos.left}px, ${pos.top}px) translateY(-50%)` }}
    >
      <div className="min-w-[15rem] max-w-[25rem] min-h-[15rem] max-h-[25rem] flex items-center justify-center overflow-auto">
        {preview}
      </div>
    </div>
  );

  return (
    <span
      ref={wrapperRef}
      className={`inline-block ${className}`.trim()}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show && createPortal(previewEl, document.body)}
    </span>
  );
};

export default HoverPreview;
