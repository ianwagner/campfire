export function review2to3(status = '') {
  const key = String(status || '').toLowerCase().replace(/\s+/g, '_');
  switch (key) {
    case 'ready':
      return 'pending';
    case 'edit_requested':
      return 'edit requested';
    case 'approved':
    case 'rejected':
    case 'pending':
      return key; // same spelling in review3
    default:
      return key;
  }
}

export function review3toRecipe(status = '') {
  const key = String(status || '').toLowerCase();
  switch (key) {
    case 'pending':
      return 'ready';
    case 'edit requested':
      return 'edit_requested';
    default:
      return key;
  }
}

export function review2toRecipe(status = '') {
  return review3toRecipe(review2to3(status));
}
