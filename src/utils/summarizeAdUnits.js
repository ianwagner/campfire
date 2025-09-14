export default function summarizeAdUnits(list = []) {
  const summary = { reviewed: 0, approved: 0, edit: 0, rejected: 0, archived: 0, thumbnail: '' };
  list.forEach((u) => {
    if (!summary.thumbnail && (u.thumbnailUrl || u.firebaseUrl)) {
      summary.thumbnail = u.thumbnailUrl || u.firebaseUrl;
    }
    const status = u.status;
    if (status === 'archived') {
      summary.archived += 1;
    } else {
      if (status !== 'ready') summary.reviewed += 1;
      if (status === 'approved') summary.approved += 1;
      if (status === 'edit_requested') summary.edit += 1;
      if (status === 'rejected') summary.rejected += 1;
    }
  });
  return summary;
}
