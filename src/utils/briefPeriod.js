const pad = (value) => String(value).padStart(2, '0');

export function getCurrentPeriod(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}${pad(month)}`;
}

export function periodToDate(period) {
  if (typeof period !== 'string' || period.length !== 6) return null;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

export function formatPeriodToMonthName(period, locale = 'en-US', withYear = true) {
  const date = periodToDate(period);
  if (!date) return '';
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
  return formatter.format(date);
}
