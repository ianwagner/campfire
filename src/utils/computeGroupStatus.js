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

  if (!currentStatus) {
    return 'new';
  }

  const sanitized = String(currentStatus).trim().replace(/\s+/g, '_').toLowerCase();

  if (legacyMap[sanitized]) {
    return legacyMap[sanitized];
  }

  if (manualStatuses.has(sanitized)) {
    return sanitized;
  }

  return 'new';
}
