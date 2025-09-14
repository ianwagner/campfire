import { bridgeReview2Status, bridgeRecipeStatus } from './bridgeReviewStatus.js';

test('bridgeReview2Status converts legacy statuses', () => {
  expect(bridgeReview2Status('reviewed')).toBe('done');
  expect(bridgeReview2Status('review pending')).toBe('ready');
  expect(bridgeReview2Status('in review')).toBe('ready');
  expect(bridgeReview2Status('approved')).toBe('approved');
});

test('bridgeRecipeStatus normalizes review statuses for recipes', () => {
  expect(bridgeRecipeStatus('edit requested')).toBe('edit_requested');
  expect(bridgeRecipeStatus('approved')).toBe('approved');
});
