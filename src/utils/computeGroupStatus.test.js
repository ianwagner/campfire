import computeGroupStatus from './computeGroupStatus';

test('returns in review when currentStatus is in review', () => {
  const status = computeGroupStatus([{ status: 'ready' }], 'in review');
  expect(status).toBe('in review');
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

test('returns review pending when currentStatus is review pending', () => {
  const status = computeGroupStatus([{ status: 'pending' }], 'review pending');
  expect(status).toBe('review pending');
});

test('returns pending otherwise', () => {
  const status = computeGroupStatus([{ status: 'pending' }], 'pending');
  expect(status).toBe('pending');
});
