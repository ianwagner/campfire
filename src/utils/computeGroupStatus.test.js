import computeGroupStatus from './computeGroupStatus';

test('keeps blocked when current status is blocked', () => {
  const status = computeGroupStatus([{ status: 'approved' }], false, false, 'blocked');
  expect(status).toBe('blocked');
});

test('keeps briefed when current status is briefed', () => {
  const status = computeGroupStatus([], true, false, 'briefed');
  expect(status).toBe('briefed');
});

test('returns new when no current status is provided', () => {
  const status = computeGroupStatus([], true, false);
  expect(status).toBe('new');
});

test('normalizes legacy ready status to designed', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, false, 'ready');
  expect(status).toBe('designed');
});

test('normalizes legacy edit request status to reviewed', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, false, 'edit request');
  expect(status).toBe('reviewed');
});

test('normalizes legacy processing status to new', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, false, 'processing');
  expect(status).toBe('new');
});

test('keeps reviewed status when already finalized', () => {
  const status = computeGroupStatus(
    [{ status: 'approved' }, { status: 'rejected' }],
    false,
    false,
    'reviewed',
  );
  expect(status).toBe('reviewed');
});

test('keeps designed status when already set manually', () => {
  const status = computeGroupStatus(
    [{ status: 'pending' }, { status: 'approved' }],
    false,
    false,
    'designed',
  );
  expect(status).toBe('designed');
});
