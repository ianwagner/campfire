import React from 'react';

const StatusBadge = ({ status, className = '' }) => {
  if (!status) return null;
  const sanitized = String(status).replace(/\s+/g, '_').toLowerCase();
  return (
    <span className={`status-badge status-${sanitized} ${className}`.trim()}>
      {status}
    </span>
  );
};

export default StatusBadge;
