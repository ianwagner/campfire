import computeGroupStatus from './computeGroupStatus';

test('preserves inReview when already set', () => {
  const status = computeGroupStatus([{ status: 'pending' }], 'inReview', 1);
  expect(status).toBe('inReview');
});

test('preserves inDesign when already set', () => {
  const status = computeGroupStatus([{ status: 'pending' }], 'inDesign', 1);
  expect(status).toBe('inDesign');
});

test('returns done when all ads are finalized', () => {
  const status = computeGroupStatus(
    [
      { status: 'approved' },
      { status: 'rejected' },
      { status: 'archived' },
    ],
    'inDesign',
    1,
  );
  expect(status).toBe('done');
});

test('returns editRequest when any ad has edit requested', () => {
  const status = computeGroupStatus(
    [{ status: 'edit_requested' }, { status: 'approved' }],
    'inDesign',
    1,
  );
  expect(status).toBe('editRequest');
});

test('returns archived when all ads are archived', () => {
  const status = computeGroupStatus(
    [{ status: 'archived' }],
    'inDesign',
    1,
  );
  expect(status).toBe('archived');
});

test('returns briefed when recipes exist but no assets', () => {
  const status = computeGroupStatus([], 'new', 2);
  expect(status).toBe('briefed');
});

test('returns new when no recipes and no assets', () => {
  const status = computeGroupStatus([], 'new', 0);
  expect(status).toBe('new');
});
