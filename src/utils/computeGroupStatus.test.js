import computeGroupStatus from './computeGroupStatus';

test('keeps blocked when current status is blocked', () => {
  const status = computeGroupStatus([{ status: 'approved' }], false, false, 'blocked');
  expect(status).toBe('blocked');
});

test('keeps briefed when current status is briefed', () => {
  const status = computeGroupStatus([], true, false, 'briefed');
  expect(status).toBe('briefed');
});

test('returns new when no assets are present', () => {
  const status = computeGroupStatus([], true, false);
  expect(status).toBe('new');
});

test('returns designed when marked in design and no reviews yet', () => {
  const status = computeGroupStatus([{ status: 'ready' }], false, true);
  expect(status).toBe('designed');
});

test('returns reviewed when some assets have been reviewed', () => {
  const status = computeGroupStatus(
    [{ status: 'approved' }, { status: 'pending' }],
    false,
    false,
  );
  expect(status).toBe('reviewed');
});

test('normalizes legacy ready status to designed', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, false, 'ready');
  expect(status).toBe('designed');
});

test('normalizes legacy edit request status to reviewed', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, false, 'edit request');
  expect(status).toBe('reviewed');
});

test('returns done when all active assets reviewed', () => {
  const status = computeGroupStatus(
    [{ status: 'approved' }, { status: 'rejected' }, { status: 'archived' }],
    false,
    false,
  );
  expect(status).toBe('done');
});

test('falls back to processing when work remains', () => {
  const status = computeGroupStatus([{ status: 'ready' }], false, false);
  expect(status).toBe('processing');
});
