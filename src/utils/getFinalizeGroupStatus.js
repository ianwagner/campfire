const DONE_ELIGIBLE_STATUSES = new Set(['approved', 'rejected', 'archived']);

function normalizeStatus(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

export default function getFinalizeGroupStatus(ads) {
  if (!Array.isArray(ads) || ads.length === 0) {
    return 'reviewed';
  }

  let eligibleCount = 0;

  for (const asset of ads) {
    if (!asset || typeof asset !== 'object') {
      return 'reviewed';
    }

    const normalizedStatus = normalizeStatus(asset.status);
    if (!normalizedStatus) {
      return 'reviewed';
    }

    if (!DONE_ELIGIBLE_STATUSES.has(normalizedStatus)) {
      return 'reviewed';
    }

    eligibleCount += 1;
  }

  return eligibleCount > 0 ? 'done' : 'reviewed';
}

export { DONE_ELIGIBLE_STATUSES };
