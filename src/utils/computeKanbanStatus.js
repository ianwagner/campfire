export default function computeKanbanStatus(group) {
  const assetCount = group?.assetCount || 0;
  const counts = group?.counts || {};
  const approved = counts.approved || 0;
  const archived = counts.archived || 0;
  const rejected = counts.rejected || 0;
  const edit = counts.edit || 0;

  if (group?.status === 'blocked') return 'blocked';
  if (group?.status === 'briefed') return 'briefed';
  if (group?.status === 'reviewed') return 'reviewed';
  if (group?.status === 'designed') return 'designed';
  if (group?.status === 'done') return 'done';
  if (assetCount === 0) return 'new';
  if (approved + archived + rejected >= assetCount) return 'done';
  if (edit > 0) return 'designed';
  return 'designed';
}
