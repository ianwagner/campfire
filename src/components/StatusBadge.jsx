import React from "react";

const knownStatuses = new Set([
  "new",
  "pending",
  "processing",
  "briefed",
  "ready",
  "approved",
  "rejected",
  "edit_requested",
  "archived",
  "draft",
  "mixed",
  "designed",
  "edit_request",
  "done",
  "blocked",
]);

const StatusBadge = ({ status, className = "" }) => {
  if (!status) return null;
  const sanitized = String(status).replace(/\s+/g, "_").toLowerCase();
  const statusClass = knownStatuses.has(sanitized)
    ? `status-${sanitized}`
    : "status-default";
  return (
    <span className={`status-badge ${statusClass} ${className}`.trim()}>
      {status}
    </span>
  );
};

export default StatusBadge;
