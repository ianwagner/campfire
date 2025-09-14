import { review2to3, review3toRecipe, review2toRecipe } from './bridgeReviewStatus.js';

test('review2 statuses map to review3', () => {
  expect(review2to3('edit_requested')).toBe('edit requested');
  expect(review2to3('ready')).toBe('pending');
  expect(review2to3('approved')).toBe('approved');
});

test('review3 statuses map to recipe status', () => {
  expect(review3toRecipe('edit requested')).toBe('edit_requested');
  expect(review3toRecipe('pending')).toBe('ready');
  expect(review3toRecipe('approved')).toBe('approved');
});

test('review2 statuses map directly to recipe status', () => {
  expect(review2toRecipe('edit_requested')).toBe('edit_requested');
  expect(review2toRecipe('ready')).toBe('ready');
});
