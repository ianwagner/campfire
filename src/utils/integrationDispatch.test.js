jest.mock('../firebase/config', () => ({
  db: {},
}));

import { isDuplicateConflictResponse } from './integrationDispatch';

describe('isDuplicateConflictResponse', () => {
  it('returns true when status is 409 and duplicate message is present', () => {
    const dispatchEntry = {
      body: {
        message: 'Duplicate: Group "INDIANA" Recipe 2 already exists',
      },
    };

    expect(isDuplicateConflictResponse(409, dispatchEntry, null)).toBe(true);
  });

  it('returns true when a server error includes a duplicate message', () => {
    const parsedResponse = {
      body: {
        error: 'Duplicate: Group "INDIANA" Recipe 2 already exists',
      },
    };

    expect(isDuplicateConflictResponse(500, null, parsedResponse)).toBe(true);
  });

  it('returns true when message only references an existing record', () => {
    const dispatchEntry = {
      message: 'Record already exists',
    };

    expect(isDuplicateConflictResponse(500, dispatchEntry, null)).toBe(true);
  });

  it('returns true when dispatch marks the status as duplicate', () => {
    const dispatchEntry = {
      status: 'duplicate',
      message: '',
    };

    expect(isDuplicateConflictResponse(500, dispatchEntry, null)).toBe(true);
  });

  it('returns true for 409 responses that have duplicate hints', () => {
    const dispatchEntry = {
      message: 'Campaign has already been submitted',
    };

    expect(isDuplicateConflictResponse(409, dispatchEntry, null)).toBe(true);
  });

  it('returns false when message does not indicate a duplicate', () => {
    const dispatchEntry = {
      body: {
        message: 'Conflict updating record',
      },
    };

    expect(isDuplicateConflictResponse(409, dispatchEntry, null)).toBe(false);
  });

  it('checks parsed response when dispatch entry is missing details', () => {
    const parsedResponse = {
      error: 'Duplicate: Group "INDIANA" Recipe 2 already exists',
    };

    expect(isDuplicateConflictResponse(409, null, parsedResponse)).toBe(true);
  });

  it('returns false for non-error status codes', () => {
    const dispatchEntry = {
      body: {
        message: 'Duplicate: Group "INDIANA" Recipe 2 already exists',
      },
    };

    expect(isDuplicateConflictResponse(200, dispatchEntry, null)).toBe(false);
  });
});
