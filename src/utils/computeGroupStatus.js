export default function computeGroupStatus(
  assets = [],
  currentStatus = 'new',
  recipeCount = 0,
) {
  if (
    assets.length > 0 &&
    assets.every((a) =>
      ['approved', 'rejected', 'archived'].includes(a.status),
    )
  )
    return 'done';
  if (assets.some((a) => a.status === 'edit_requested')) return 'editRequest';
  const active = assets.filter((a) => a.status !== 'archived');
  if (active.length === 0) {
    if (assets.length === 0) return recipeCount > 0 ? 'briefed' : 'new';
    return 'archived';
  }
  if (currentStatus === 'inReview') return 'inReview';
  if (currentStatus === 'inDesign') return 'inDesign';
  return recipeCount > 0 ? 'briefed' : 'new';
}
