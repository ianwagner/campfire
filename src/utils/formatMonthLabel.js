export default function formatMonthLabel(month) {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1));
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
