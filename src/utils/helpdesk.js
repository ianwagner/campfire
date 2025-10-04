export const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (err) {
      return null;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const formatRelativeTime = (value) => {
  const date = toDateSafe(value);
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return 'just now';
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.round(diffMs / (60 * 1000));
    return `${mins}m ago`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diffMs / (60 * 60 * 1000));
    return `${hours}h ago`;
  }
  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }
  return date.toLocaleDateString();
};

export const defaultTicketTitle = (message) => {
  if (!message) return 'Helpdesk request';
  const firstLine = message.split('\n').find((line) => line.trim());
  if (!firstLine) return 'Helpdesk request';
  return firstLine.trim().slice(0, 80);
};

export const formatDisplayName = (value) => {
  if (!value || typeof value !== 'string') return '';
  if (!value.includes('@')) return value;

  const namePart = value.split('@')[0];
  const cleaned = namePart
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

  return cleaned.length > 0 ? cleaned.join(' ') : value;
};

export default {
  toDateSafe,
  formatRelativeTime,
  defaultTicketTitle,
  formatDisplayName,
};
