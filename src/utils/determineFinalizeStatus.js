const DONE_ELIGIBLE_STATUSES = new Set(['approved', 'rejected', 'archived']);
const EDIT_REQUEST_STATUSES = new Set([
  'edit_requested',
  'edit request',
  'edit-requested',
]);

const normalizeStatus = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  return String(value).trim().toLowerCase();
};

export default function determineFinalizeStatus(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return 'reviewed';
  }

  let hasAnyAssets = false;
  let allEligibleForDone = true;
  let hasEditRequests = false;

  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') {
      allEligibleForDone = false;
      continue;
    }

    const normalized = normalizeStatus(asset.status);
    if (!normalized) {
      allEligibleForDone = false;
      continue;
    }

    hasAnyAssets = true;

    if (EDIT_REQUEST_STATUSES.has(normalized)) {
      hasEditRequests = true;
    }

    if (!DONE_ELIGIBLE_STATUSES.has(normalized)) {
      allEligibleForDone = false;
    }
  }

  if (hasEditRequests) {
    return 'designed';
  }

  if (hasAnyAssets && allEligibleForDone) {
    return 'done';
  }

  return 'reviewed';
}
