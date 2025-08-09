export default function computeGroupStatus(
  assets = [],
  hasRecipes = false,
  inDesign = false,
) {
  if (hasRecipes && assets.length === 0) return 'briefed';
  if (inDesign) return 'designing';
  if (
    assets.length > 0 &&
    assets.every((a) =>
      ['approved', 'rejected', 'archived'].includes(a.status),
    )
  )
    return 'done';
  if (assets.some((a) => a.status === 'edit_requested')) return 'edit request';
  const active = assets.filter((a) => a.status !== 'archived');
  if (active.some((a) => a.status === 'ready')) return 'ready';
  return 'pending';
}
