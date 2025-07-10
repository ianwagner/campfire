export default function computeGroupStatus(
  assets = [],
  currentStatus = 'pending',
  override = null,
) {
  if (override) return override;
  if (currentStatus === 'archived') return 'archived';
  if (currentStatus === 'in review') return 'in review';
  if (assets.some((a) => a.status === 'ready')) return 'ready';
  if (
    assets.length > 0 &&
    assets.every((a) => a.status !== 'ready' && a.status !== 'pending')
  ) {
    return 'reviewed';
  }
  if (currentStatus === 'review pending') return 'review pending';
  if (currentStatus === 'briefed') return 'briefed';
  return 'pending';
}
