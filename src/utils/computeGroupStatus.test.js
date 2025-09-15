import computeGroupStatus from './computeGroupStatus';

test('returns briefed when hasRecipes and no assets', () => {
  const status = computeGroupStatus([], true, false);
  expect(status).toBe('briefed');
});

test('returns pending when no recipes and no assets', () => {
  const status = computeGroupStatus([], false, false);
  expect(status).toBe('pending');
});

test('returns designing when inDesign is true', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, true);
  expect(status).toBe('designing');
});

test('returns done when all ads reviewed', () => {
  const status = computeGroupStatus(
    [{ status: 'approved' }, { status: 'rejected' }, { status: 'archived' }],
    false,
    false,
  );
  expect(status).toBe('done');
});

test('returns edit request when any edit requested', () => {
  const status = computeGroupStatus(
    [{ status: 'edit_requested' }, { status: 'approved' }],
    false,
    false,
  );
  expect(status).toBe('edit request');
});

test('returns ready when any ad is ready', () => {
  const status = computeGroupStatus(
    [{ status: 'ready' }, { status: 'approved' }],
    false,
    false,
  );
  expect(status).toBe('ready');
});

test('returns pending when both pending and ready ads exist', () => {
  const status = computeGroupStatus(
    [{ status: 'ready' }, { status: 'pending' }],
    false,
    false,
  );
  expect(status).toBe('pending');
});

test('uses status of non-archived ads', () => {
  const status = computeGroupStatus(
    [{ status: 'archived' }, { status: 'ready' }],
    false,
    false,
  );
  expect(status).toBe('ready');
});

test('returns pending otherwise', () => {
  const status = computeGroupStatus([{ status: 'pending' }], false, false);
  expect(status).toBe('pending');
});

test('returns blocked when current status is blocked', () => {
  const status = computeGroupStatus([{ status: 'approved' }], false, false, 'blocked');
  expect(status).toBe('blocked');
});

test('returns reviewed when current status is reviewed', () => {
  const status = computeGroupStatus([{ status: 'approved' }], false, false, 'reviewed');
  expect(status).toBe('reviewed');
});
