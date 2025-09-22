export const normalizeReviewVersion = (value) => {
  if (value === undefined || value === null) return '1';

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '1';
    return String(value);
  }

  if (typeof value === 'object') {
    if (value.reviewVersion !== undefined) {
      return normalizeReviewVersion(value.reviewVersion);
    }
    if (value.reviewType !== undefined) {
      return normalizeReviewVersion(value.reviewType);
    }
    if (value.type !== undefined) {
      return normalizeReviewVersion(value.type);
    }
    if (value.version !== undefined) {
      return normalizeReviewVersion(value.version);
    }
    if (value.value !== undefined) {
      return normalizeReviewVersion(value.value);
    }
    if (value.label !== undefined) {
      return normalizeReviewVersion(value.label);
    }
    return '1';
  }

  const normalized = String(value).toLowerCase();
  if (normalized === '1' || normalized.includes('legacy')) return '1';
  if (normalized === '2' || normalized.includes('2.0') || normalized.includes('v2')) {
    return '2';
  }
  if (
    normalized === '3' ||
    normalized.includes('3.0') ||
    normalized.includes('v3') ||
    normalized.includes('brief')
  )
    return '3';
  return '1';
};

export const getReviewTypeLabel = (value) => {
  const normalized = normalizeReviewVersion(value);

  switch (normalized) {
    case '2':
      return '2.0';
    case '3':
      return 'Brief';
    case '1':
    default:
      return 'Legacy';
  }
};
