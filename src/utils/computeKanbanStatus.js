export default function computeKanbanStatus(group) {
  const assetCount = group?.assetCount || 0;
  const counts = group?.counts || {};
  const approved = counts.approved || 0;
  const archived = counts.archived || 0;
  const rejected = counts.rejected || 0;
  const edit = counts.edit || 0;

  if (assetCount === 0) return 'new';
  if (edit > 0) return 'edit request';
  if (approved + archived + rejected === assetCount) return 'done';
  return 'designed';
}
