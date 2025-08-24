import React from "react";
import { FiAlertTriangle } from "react-icons/fi";

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
  "info_needed",
  "done",
]);

const StatusBadge = ({ status, className = "" }) => {
  if (!status) return null;
  const sanitized = String(status).replace(/\s+/g, "_").toLowerCase();
  const statusClass = knownStatuses.has(sanitized)
    ? `status-${sanitized}`
    : "status-default";
  const iconMap = {
    info_needed: FiAlertTriangle,
  };
  const Icon = iconMap[sanitized];
  return (
    <span className={`status-badge ${statusClass} ${className} inline-flex items-center gap-1`.trim()}>
      {Icon && <Icon />}
      {status}
    </span>
  );
};

export default StatusBadge;
