export const hasReviewerDisplayName = (reviewerName) => {
  if (typeof reviewerName !== 'string') return false;
  return reviewerName.trim().length > 0;
};

export const isRealtimeReviewerEligible = ({
  allowPublicListeners = true,
  isPublicReviewer = false,
  isAuthenticated = false,
  reviewerName = '',
} = {}) => {
  if (!allowPublicListeners) return false;
  if (isPublicReviewer) return true;
  if (!isAuthenticated) return false;
  return hasReviewerDisplayName(reviewerName);
};

