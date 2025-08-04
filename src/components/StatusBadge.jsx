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
  "in_review",
  "review_pending",
  "mixed",
  "in_design",
  "edit_request",
  "done",
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
