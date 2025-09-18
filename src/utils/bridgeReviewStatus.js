export function bridgeReview2Status(status = '') {
  switch (status) {
    case 'reviewed':
      return 'done';
    case 'review pending':
    case 'in review':
      return 'ready';
    default:
      return status;
  }
}

export function bridgeRecipeStatus(status = '') {
  if (status === 'edit requested') return 'edit_requested';
  return status;
}

export default { bridgeReview2Status, bridgeRecipeStatus };
