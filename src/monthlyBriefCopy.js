import { formatPeriodToMonthName } from './utils/briefPeriod.js';

export const MONTHLY_BRIEF_MENU_LABEL = 'Brief new ads';

export const MONTHLY_BRIEF_STATE_BADGES = {
  AVAILABLE: { label: 'Open', tone: 'success' },
  SUBMITTED_EDITABLE: { label: 'Submitted', tone: 'info' },
  CLOSED_BRAND: { label: 'Closed', tone: 'muted' },
  CLOSED_AGENCY: { label: 'Closed', tone: 'muted' },
  loading: { label: 'Loading', tone: 'muted' },
};

export const MONTHLY_BRIEF_BADGE_TONE_CLASSES = {
  success:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-500/30',
  info:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-300/60 dark:border-blue-500/30',
  muted:
    'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border border-gray-300/60 dark:border-gray-600/60',
};

export const MONTHLY_BRIEF_DEFAULT_WINDOW = [10, 14];

export const MONTHLY_BRIEF_BODY_COPY =
  "Upload photos, list products/campaigns, add notes. We’ll take it from here.";

export function getMonthlyBriefBadge(state) {
  return MONTHLY_BRIEF_STATE_BADGES[state] || null;
}

export function getMonthlyBriefHeader(agencyName) {
  return `Monthly Brief — ${agencyName || 'Campfire'}`;
}

export function getMonthlyBriefIntro(period, locale = 'en-US') {
  const month = formatPeriodToMonthName(period, locale, true);
  if (!month) return "Gather ’round — set your direction for this month.";
  return `Gather ’round — set your direction for ${month}.`;
}

export function formatDeliveryWindow(window, { includeRolling = true } = {}) {
  const days = Array.isArray(window) && window.length === 2 ? window : MONTHLY_BRIEF_DEFAULT_WINDOW;
  const [min, max] = days;
  if (!min || !max) {
    return includeRolling
      ? 'Delivery window: rolling once your brief is submitted.'
      : 'Delivery window: in production.';
  }
  const range = `${min}–${max} days`;
  return includeRolling
    ? `Delivery window: rolling, within ${range} of submission.`
    : `Delivery window: ${range}.`;
}

export function getSubmittedMessage(canEditUntilFormatted) {
  if (!canEditUntilFormatted) return 'Brief received.';
  return `Brief received. You can make updates until ${canEditUntilFormatted}.`;
}

export function getClosedCopy(type, agencyName) {
  if (type === 'agency') {
    return {
      title: `Brief window closed — ${agencyName || 'your agency'}.`,
      body: "Your ads are in production. We’ll notify you when the next window opens.",
    };
  }
  return {
    title: "This month’s brief is closed for your brand.",
    body: "Your ads are already moving through production. We’ll ping you when next month’s brief opens.",
  };
}

export function formatDateTime(isoString, locale = 'en-US', options = {}) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: options.dateStyle || 'medium',
      timeStyle: options.timeStyle || 'short',
    });
    return formatter.format(date);
  } catch (err) {
    return '';
  }
}
