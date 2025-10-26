const DONE_ELIGIBLE_STATUSES = new Set(['approved', 'rejected', 'archived']);
const EDIT_REQUEST_STATUSES = new Set([
  'edit_requested',
  'edit-requested',
  'edit request',
]);
const PENDING_LIKE_STATUSES = new Set([
  'pending',
  'ready',
  'in_progress',
  'in-progress',
]);

const normalizeStatus = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim().replace(/\s+/g, '_').toLowerCase();
  }
  return String(value).trim().replace(/\s+/g, '_').toLowerCase();
};

const determineStatusFromAssets = (assets = [], hasRecipes = false, inDesign = false) => {
  const list = Array.isArray(assets) ? assets.filter(Boolean) : [];
  if (list.length === 0) {
    return inDesign ? 'designed' : hasRecipes ? 'briefed' : 'new';
  }

  let total = list.length;
  let doneEligible = 0;
  let editRequested = 0;
  let pending = 0;

  list.forEach((asset) => {
    const normalized = normalizeStatus(asset?.status);
    if (!normalized) {
      pending += 1;
      return;
    }
    if (EDIT_REQUEST_STATUSES.has(normalized)) {
      editRequested += 1;
      return;
    }
    if (DONE_ELIGIBLE_STATUSES.has(normalized)) {
      doneEligible += 1;
      return;
    }
    if (PENDING_LIKE_STATUSES.has(normalized)) {
      pending += 1;
      return;
    }
    // Treat unknown statuses as in-progress so we avoid prematurely marking done.
    pending += 1;
  });

  if (editRequested > 0) {
    return 'reviewed';
  }

  if (doneEligible >= total && pending === 0) {
    return 'done';
  }

  if (pending > 0) {
    return 'designed';
  }

  if (doneEligible > 0) {
    return 'done';
  }

  return inDesign ? 'designed' : hasRecipes ? 'briefed' : 'new';
};

export default function computeGroupStatus(
  assets = [],
  hasRecipes = false,
  inDesign = false,
  currentStatus,
) {
  const manualStatuses = new Set([
    'new',
    'briefed',
    'blocked',
    'designed',
    'reviewed',
    'done',
    'archived',
  ]);

  const legacyMap = {
    ready: 'designed',
    in_design: 'designed',
    'in design': 'designed',
    edit_request: 'reviewed',
    'edit request': 'reviewed',
    edit_requested: 'reviewed',
    pending: 'new',
    processing: 'new',
  };

  if (currentStatus) {
    const sanitized = normalizeStatus(currentStatus);

    if (legacyMap[sanitized]) {
      return legacyMap[sanitized];
    }

    if (manualStatuses.has(sanitized)) {
      return sanitized;
    }
  }

  return determineStatusFromAssets(assets, hasRecipes, inDesign);
}
