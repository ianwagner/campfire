export default function computeGroupStatus(
  assets = [],
  hasRecipes = false,
  inDesign = false,
  currentStatus,
) {
  let normalized = currentStatus;
  if (currentStatus === 'ready') normalized = 'designed';
  else if (currentStatus === 'edit request') normalized = 'reviewed';
  else if (currentStatus === 'pending') normalized = 'processing';

  if (['archived', 'blocked'].includes(normalized)) return normalized;
  if (normalized === 'briefed') return 'briefed';

  const active = assets.filter((a) => a.status !== 'archived');
  if (active.length === 0) {
    return normalized ?? 'new';
  }

  const allReviewed = active.every((a) =>
    ['approved', 'rejected'].includes(a.status),
  );
  if (allReviewed) return 'done';

  if (normalized === 'done' || normalized === 'reviewed') {
    return normalized;
  }

  if (inDesign || normalized === 'designed') return 'designed';

  if (normalized && !['done', 'reviewed'].includes(normalized)) {
    return normalized;
  }

  return 'processing';
}
