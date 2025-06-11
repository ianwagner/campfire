import computeGroupStatus from './computeGroupStatus';

test('returns locked when currentStatus is locked', () => {
  const status = computeGroupStatus([{ status: 'ready' }], 'locked');
  expect(status).toBe('locked');
});

test('returns archived when currentStatus is archived', () => {
  const status = computeGroupStatus([{ status: 'ready' }], 'archived');
  expect(status).toBe('archived');
});

test('returns ready when any ad is ready', () => {
  const status = computeGroupStatus([{ status: 'ready' }, { status: 'approved' }], 'pending');
  expect(status).toBe('ready');
});

test('returns reviewed when all ads reviewed', () => {
  const status = computeGroupStatus([{ status: 'approved' }, { status: 'rejected' }], 'ready');
  expect(status).toBe('reviewed');
});

test('returns pending otherwise', () => {
  const status = computeGroupStatus([{ status: 'pending' }], 'pending');
  expect(status).toBe('pending');
});

test('keeps planning status until all recipes have ads', () => {
  const status = computeGroupStatus([{ recipeCode: '1', status: 'pending' }], 'planning', 2);
  expect(status).toBe('planning');
});

test('changes to pending when all recipes have ads', () => {
  const status = computeGroupStatus([
    { recipeCode: '1', status: 'pending' },
    { recipeCode: '2', status: 'pending' },
  ], 'briefed', 2);
  expect(status).toBe('pending');
});
