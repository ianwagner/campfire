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

const HELP_DESK_LAST_SEEN_PREFIX = 'helpdesk:lastSeen:';

const getLocalStorageSafe = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch (err) {
    return null;
  }
};

const getStorageKeyForTicket = (ticketId) => {
  if (!ticketId) return '';
  return `${HELP_DESK_LAST_SEEN_PREFIX}${ticketId}`;
};

export const getHelpdeskLastSeen = (ticketId) => {
  if (!ticketId) return 0;
  const storage = getLocalStorageSafe();
  if (!storage) return 0;
  try {
    const raw = storage.getItem(getStorageKeyForTicket(ticketId));
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (err) {
    return 0;
  }
};

export const markHelpdeskTicketAsRead = (ticketId, timestamp = Date.now()) => {
  if (!ticketId) return;
  const storage = getLocalStorageSafe();
  if (!storage) return;
  const normalized = Number(timestamp);
  const safeValue = Number.isFinite(normalized) ? normalized : Date.now();
  try {
    storage.setItem(getStorageKeyForTicket(ticketId), String(safeValue));
  } catch (err) {
    // Ignore write errors (e.g., storage full or unavailable)
  }
};

export const helpdeskTicketHasUnread = (ticket) => {
  if (!ticket || !ticket.id) return false;
  const lastActivity = toDateSafe(
    ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt,
  );
  if (!lastActivity) return false;
  const lastSeen = getHelpdeskLastSeen(ticket.id);
  return lastSeen < lastActivity.getTime();
};

export const countUnreadHelpdeskTickets = (tickets = []) =>
  tickets.reduce(
    (count, ticket) => count + (helpdeskTicketHasUnread(ticket) ? 1 : 0),
    0,
  );

export default {
  toDateSafe,
  formatRelativeTime,
  defaultTicketTitle,
  formatDisplayName,
  getHelpdeskLastSeen,
  markHelpdeskTicketAsRead,
  helpdeskTicketHasUnread,
  countUnreadHelpdeskTickets,
};
