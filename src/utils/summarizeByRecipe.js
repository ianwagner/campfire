import parseAdFilename from './parseAdFilename';

const STATUS_PRIORITY = {
  approved: 3,
  edit_requested: 2,
  rejected: 1,
};

function getPriority(status = '') {
  return STATUS_PRIORITY[status] || 0;
}

export default function summarizeByRecipe(list = []) {
  const summary = { reviewed: 0, approved: 0, edit: 0, rejected: 0, archived: 0, thumbnail: '' };
  const map = {};
  list.forEach((a) => {
    if (!summary.thumbnail && (a.thumbnailUrl || a.firebaseUrl)) {
      summary.thumbnail = a.thumbnailUrl || a.firebaseUrl;
    }
    const info = parseAdFilename(a.filename || '');
    const recipe = a.recipeCode || info.recipeCode || '';
    if (!recipe) return;
    const prev = map[recipe];
    if (!prev || getPriority(a.status) > getPriority(prev)) {
      map[recipe] = a.status;
    }
    if (a.status === 'archived') summary.archived += 1;
  });
  Object.values(map).forEach((status) => {
    if (status !== 'ready') summary.reviewed += 1;
    if (status === 'approved') summary.approved += 1;
    if (status === 'edit_requested') summary.edit += 1;
    if (status === 'rejected') summary.rejected += 1;
  });
  return summary;
}
