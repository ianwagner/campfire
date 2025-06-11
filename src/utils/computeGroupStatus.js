export default function computeGroupStatus(
  assets = [],
  currentStatus = 'planning',
  recipeCount,
) {
  if (currentStatus === 'archived') return 'archived';
  if (currentStatus === 'locked') return 'locked';

  if (
    (currentStatus === 'planning' || currentStatus === 'briefed') &&
    typeof recipeCount === 'number'
  ) {
    const codes = new Set();
    assets.forEach((a) => {
      if (a.recipeCode) codes.add(a.recipeCode);
    });
    if (codes.size < recipeCount) return currentStatus;
  }

  if (assets.some((a) => a.status === 'ready')) return 'ready';
  if (
    assets.length > 0 &&
    assets.every((a) => a.status !== 'ready' && a.status !== 'pending')
  ) {
    return 'reviewed';
  }
  return 'pending';
}
