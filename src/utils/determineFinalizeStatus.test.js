import determineFinalizeStatus from './determineFinalizeStatus';

describe('determineFinalizeStatus', () => {
  it('returns done when all assets are approved, rejected, or archived', () => {
    const assets = [
      { status: 'approved' },
      { status: 'rejected' },
      { status: 'archived' },
    ];

    expect(determineFinalizeStatus(assets)).toBe('done');
  });

  it('returns designed when any asset has an edit request', () => {
    const assets = [
      { status: 'approved' },
      { status: 'edit_requested' },
      { status: 'archived' },
    ];

    expect(determineFinalizeStatus(assets)).toBe('designed');
  });

  it('returns reviewed when assets include other statuses', () => {
    const assets = [
      { status: 'approved' },
      { status: 'pending' },
    ];

    expect(determineFinalizeStatus(assets)).toBe('reviewed');
  });

  it('handles falsy or malformed asset entries', () => {
    const assets = [
      null,
      undefined,
      {},
      { status: '' },
      { status: 'approved' },
    ];

    expect(determineFinalizeStatus(assets)).toBe('reviewed');
  });

  it('treats edit request variants the same', () => {
    expect(determineFinalizeStatus([{ status: 'edit request' }])).toBe('designed');
    expect(determineFinalizeStatus([{ status: 'edit-requested' }])).toBe('designed');
  });

  it('defaults to reviewed when no assets are provided', () => {
    expect(determineFinalizeStatus([])).toBe('reviewed');
    expect(determineFinalizeStatus()).toBe('reviewed');
  });
});
