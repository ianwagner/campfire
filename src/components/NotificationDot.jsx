import React from 'react';

const SIZE_CLASS_MAP = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3.5 w-3.5',
};

const NotificationDot = ({
  className = '',
  size = 'md',
  srText = 'Unread notifications',
}) => {
  const sizeClass = SIZE_CLASS_MAP[size] || SIZE_CLASS_MAP.md;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`.trim()}
    >
      <span className="sr-only">{srText}</span>
      <span
        aria-hidden="true"
        className={`block rounded-full bg-[var(--accent-color)] ${sizeClass}`}
      />
    </span>
  );
};

export default NotificationDot;
