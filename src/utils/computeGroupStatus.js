export default function computeGroupStatus(assets = [], currentStatus = 'pending') {
  if (currentStatus === 'archived') return 'archived';
  if (currentStatus === 'locked') return 'locked';
  if (assets.some((a) => a.status === 'ready')) return 'ready';
  if (
    assets.length > 0 &&
    assets.every((a) => a.status !== 'ready' && a.status !== 'pending')
  ) {
    return 'reviewed';
  }
  return 'pending';
}
