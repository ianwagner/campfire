export default function computeGroupStatus(
  assets = [],
  currentStatus = 'pending',
) {
  if (
    assets.length > 0 &&
    assets.every((a) =>
      ['approved', 'rejected', 'archived'].includes(a.status),
    )
  )
    return 'done';
  if (assets.some((a) => a.status === 'edit_requested')) return 'edit request';
  const active = assets.filter((a) => a.status !== 'archived');
  if (active.length === 0) {
    return currentStatus === 'briefed' ? 'briefed' : 'archived';
  }
  if (currentStatus === 'in review') return 'in review';
  if (currentStatus === 'in design') return 'in design';
  if (active.some((a) => a.status === 'ready')) return 'ready';
  if (
    active.every((a) => a.status !== 'ready' && a.status !== 'pending')
  ) {
    return 'reviewed';
  }
  if (currentStatus === 'review pending') return 'review pending';
  if (currentStatus === 'briefed') return 'briefed';
  return 'pending';
}
