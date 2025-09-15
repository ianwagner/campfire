import computeKanbanStatus from './computeKanbanStatus';

test('returns briefed when group status is briefed', () => {
  const status = computeKanbanStatus({ status: 'briefed', assetCount: 0, counts: {} });
  expect(status).toBe('briefed');
});

test('returns blocked when group status is blocked', () => {
  const status = computeKanbanStatus({ status: 'blocked', assetCount: 1, counts: {} });
  expect(status).toBe('blocked');
});

test('returns reviewed when group status is reviewed', () => {
  const status = computeKanbanStatus({ status: 'reviewed', assetCount: 1, counts: {} });
  expect(status).toBe('reviewed');
});

test('returns new when no assets', () => {
  const status = computeKanbanStatus({ assetCount: 0, counts: {} });
  expect(status).toBe('new');
});

test('returns edit request when any edits present', () => {
  const status = computeKanbanStatus({ assetCount: 2, counts: { edit: 1 } });
  expect(status).toBe('edit request');
});

test('returns done when all approved, archived, or rejected', () => {
  const status = computeKanbanStatus({ assetCount: 3, counts: { approved: 1, archived: 1, rejected: 1 } });
  expect(status).toBe('done');
});

test('returns done when all approved or rejected', () => {
  const status = computeKanbanStatus({ assetCount: 2, counts: { approved: 1, rejected: 1 } });
  expect(status).toBe('done');
});

test('returns done when counts exceed asset total', () => {
  const status = computeKanbanStatus({ assetCount: 2, counts: { approved: 1, archived: 1, rejected: 1 } });
  expect(status).toBe('done');
});

test('returns designed otherwise', () => {
  const status = computeKanbanStatus({ assetCount: 2, counts: { approved: 1, rejected: 0, edit: 0 } });
  expect(status).toBe('designed');
});
