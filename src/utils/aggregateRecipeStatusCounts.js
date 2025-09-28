import parseAdFilename from './parseAdFilename';

const DEFAULT_STATUS_COUNTS = {
  pending: 0,
  approved: 0,
  rejected: 0,
  edit_requested: 0,
  archived: 0,
};

const NORMALIZED_STATUS_MAP = {
  ready: 'pending',
};

function createEntry() {
  return {
    statuses: new Set(),
    activeStatuses: new Set(),
    hasPending: false,
    hasRejected: false,
    hasEdit: false,
    isEmpty: false,
  };
}

function determineRecipeStatus(entry) {
  const allStatuses = Array.from(entry.statuses);
  const allArchived =
    allStatuses.length > 0 && allStatuses.every((status) => status === 'archived');
  if (allArchived && !entry.isEmpty) {
    return 'archived';
  }
  if (entry.hasEdit) {
    return 'edit_requested';
  }
  if (entry.hasRejected) {
    return 'rejected';
  }
  const active = Array.from(entry.activeStatuses);
  if (active.length === 0) {
    return 'pending';
  }
  if (active.every((status) => status === 'approved')) {
    return 'approved';
  }
  if (entry.hasPending) {
    return 'pending';
  }
  const fallback = active[0];
  if (!fallback || !(fallback in DEFAULT_STATUS_COUNTS)) {
    return 'pending';
  }
  return fallback;
}

export default function aggregateRecipeStatusCounts(assets = [], recipeIds = []) {
  const map = new Map();

  (assets || []).forEach((raw) => {
    if (!raw) return;
    const asset = typeof raw.data === 'function' ? { ...raw.data(), id: raw.id } : raw;
    const rawStatus = asset.status || 'pending';
    const status = NORMALIZED_STATUS_MAP[rawStatus] || rawStatus;
    const info = parseAdFilename(asset.filename || '');
    const code = asset.recipeCode || info.recipeCode || '';
    if (!code) return;
    const entry = map.get(code) || createEntry();
    entry.statuses.add(status);
    if (status !== 'archived') {
      entry.activeStatuses.add(status);
    }
    if (status === 'pending') {
      entry.hasPending = true;
    }
    if (status === 'rejected') {
      entry.hasRejected = true;
    }
    if (status === 'edit_requested') {
      entry.hasEdit = true;
    }
    map.set(code, entry);
  });

  // Recipes without assets are intentionally ignored so they are not counted
  // as pending or as ad units until an asset is uploaded.
  void recipeIds;

  const totals = { ...DEFAULT_STATUS_COUNTS };

  map.forEach((entry) => {
    const status = determineRecipeStatus(entry);
    if (!(status in totals)) {
      totals.pending += 1;
    } else {
      totals[status] += 1;
    }
  });

  return { unitCount: map.size, statusCounts: totals };
}
