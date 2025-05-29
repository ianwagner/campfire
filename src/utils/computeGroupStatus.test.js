import computeGroupStatus from './computeGroupStatus';

test('returns locked when currentStatus is locked', () => {
  const status = computeGroupStatus([{ status: 'ready' }], 'locked');
  expect(status).toBe('locked');
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
