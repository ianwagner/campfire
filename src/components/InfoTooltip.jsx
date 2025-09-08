import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const InfoTooltip = ({
  text,
  children,
  maxWidth = 200,
  placement = 'top',
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        x: rect.left + rect.width / 2 + window.scrollX,
        y:
          placement === 'bottom'
            ? rect.bottom + window.scrollY + 4
            : rect.top + window.scrollY - 4,
      });
    }
  }, [visible, placement]);

  return (
    <span
      ref={ref}
      className="inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible &&
        createPortal(
          <div
            style={{
              position: 'absolute',
              top: coords.y,
              left: coords.x,
              transform:
                placement === 'bottom'
                  ? 'translate(-50%, 0)'
                  : 'translate(-50%, -100%)',
              zIndex: 1000,
              maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
            }}
            className="bg-white border rounded text-xs p-2 shadow dark:bg-[var(--dark-sidebar-bg)]"
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
};

export default InfoTooltip;
