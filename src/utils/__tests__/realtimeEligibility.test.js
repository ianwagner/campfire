import {
  hasReviewerDisplayName,
  isRealtimeReviewerEligible,
} from '../realtimeEligibility';

describe('hasReviewerDisplayName', () => {
  it('returns true when a non-empty name is provided', () => {
    expect(hasReviewerDisplayName('Chris Reviewer')).toBe(true);
  });

  it('trims whitespace before evaluating the name', () => {
    expect(hasReviewerDisplayName('   ')).toBe(false);
    expect(hasReviewerDisplayName('  Jamie  ')).toBe(true);
  });

  it('returns false for non-string values', () => {
    expect(hasReviewerDisplayName(null)).toBe(false);
    expect(hasReviewerDisplayName(undefined)).toBe(false);
  });
});

describe('isRealtimeReviewerEligible', () => {
  it('requires public listeners to be allowed', () => {
    expect(
      isRealtimeReviewerEligible({
        allowPublicListeners: false,
        isPublicReviewer: true,
      }),
    ).toBe(false);
  });

  it('allows public reviewers once listeners are allowed', () => {
    expect(
      isRealtimeReviewerEligible({
        allowPublicListeners: true,
        isPublicReviewer: true,
        isAuthenticated: false,
        reviewerName: '',
      }),
    ).toBe(true);
  });

  it('allows authenticated reviewers with a provided name', () => {
    expect(
      isRealtimeReviewerEligible({
        allowPublicListeners: true,
        isPublicReviewer: false,
        isAuthenticated: true,
        reviewerName: 'Jordan Client',
      }),
    ).toBe(true);
  });

  it('rejects authenticated reviewers without a name', () => {
    expect(
      isRealtimeReviewerEligible({
        allowPublicListeners: true,
        isPublicReviewer: false,
        isAuthenticated: true,
        reviewerName: '   ',
      }),
    ).toBe(false);
  });

  it('rejects unauthenticated reviewers without public access', () => {
    expect(
      isRealtimeReviewerEligible({
        allowPublicListeners: true,
        isPublicReviewer: false,
        isAuthenticated: false,
        reviewerName: 'Taylor',
      }),
    ).toBe(false);
  });
});

