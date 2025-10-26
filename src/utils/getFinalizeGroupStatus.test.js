import getFinalizeGroupStatus, {
  DONE_ELIGIBLE_STATUSES,
} from './getFinalizeGroupStatus';

describe('getFinalizeGroupStatus', () => {
  it('returns reviewed when input is not an array', () => {
    expect(getFinalizeGroupStatus(null)).toBe('reviewed');
    expect(getFinalizeGroupStatus(undefined)).toBe('reviewed');
    expect(getFinalizeGroupStatus({})).toBe('reviewed');
  });

  it('returns reviewed when array is empty', () => {
    expect(getFinalizeGroupStatus([])).toBe('reviewed');
  });

  it('returns done when every asset status is eligible', () => {
    const ads = Array.from(DONE_ELIGIBLE_STATUSES).map((status, index) => ({
      id: `asset-${index}`,
      status,
    }));
    expect(getFinalizeGroupStatus(ads)).toBe('done');
  });

  it('handles mixed casing and whitespace for eligible statuses', () => {
    const ads = [
      { id: 'asset-1', status: ' Approved ' },
      { id: 'asset-2', status: 'REJECTED' },
      { id: 'asset-3', status: '\tarchived\n' },
    ];
    expect(getFinalizeGroupStatus(ads)).toBe('done');
  });

  it('returns reviewed when any asset has a non-eligible status', () => {
    const ads = [
      { id: 'asset-1', status: 'approved' },
      { id: 'asset-2', status: 'pending' },
      { id: 'asset-3', status: 'archived' },
    ];
    expect(getFinalizeGroupStatus(ads)).toBe('reviewed');
  });

  it('returns reviewed when any asset is missing a status value', () => {
    const ads = [
      { id: 'asset-1', status: 'approved' },
      { id: 'asset-2' },
    ];
    expect(getFinalizeGroupStatus(ads)).toBe('reviewed');
  });

  it('returns reviewed when any entry is not an object', () => {
    const ads = [
      { id: 'asset-1', status: 'approved' },
      null,
      { id: 'asset-3', status: 'rejected' },
    ];
    expect(getFinalizeGroupStatus(ads)).toBe('reviewed');
  });
});
