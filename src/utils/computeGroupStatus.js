export default function computeGroupStatus(
  assets = [],
  currentStatus = 'pending',
) {
  const active = assets.filter((a) => a.status !== 'archived');
  if (active.length === 0) return 'archived';
  if (currentStatus === 'in review') return 'in review';
  if (active.some((a) => a.status === 'ready')) return 'ready';
  if (
    active.length > 0 &&
    active.every((a) => a.status !== 'ready' && a.status !== 'pending')
  ) {
    return 'reviewed';
  }
  if (currentStatus === 'review pending') return 'review pending';
  if (currentStatus === 'briefed') return 'briefed';
  return 'pending';
}
