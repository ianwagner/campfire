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
  "in_design",
  "edit_request",
  "done",
]);

const defaultOptions = [
  "pending",
  "briefed",
  "ready",
  "edit request",
  "done",
  "archived",
  "designing",
];

const StatusBadge = ({
  status,
  className = "",
  editable = false,
  options = defaultOptions,
  onChange,
}) => {
  if (!status) return null;
  const sanitized = String(status).replace(/\s+/g, "_").toLowerCase();
  const statusClass = knownStatuses.has(sanitized)
    ? `status-${sanitized}`
    : "status-default";

  if (editable) {
    return (
      <select
        value={status}
        onChange={(e) => onChange?.(e.target.value)}
        className={`status-badge ${statusClass} ${className}`.trim()}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className={`status-badge ${statusClass} ${className}`.trim()}>
      {status}
    </span>
  );
};

export default StatusBadge;
