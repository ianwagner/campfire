import aggregateRecipeStatusCounts from './aggregateRecipeStatusCounts';

describe('aggregateRecipeStatusCounts', () => {
  it('does not count recipes without any assets', () => {
    const result = aggregateRecipeStatusCounts([], ['1001', '1002']);
    expect(result.unitCount).toBe(0);
    expect(result.statusCounts.pending).toBe(0);
  });

  it('treats ready assets as pending', () => {
    const assets = [
      { id: 'a1', status: 'ready', recipeCode: '1001', filename: '1001_square.png' },
    ];
    const result = aggregateRecipeStatusCounts(assets, ['1001']);
    expect(result.statusCounts.pending).toBe(1);
    expect(result.statusCounts.approved).toBe(0);
    expect(result.statusCounts.rejected).toBe(0);
  });

  it('does not report pending when all assets are approved', () => {
    const assets = [
      { id: 'a1', status: 'approved', recipeCode: '2001', filename: '2001_square.png' },
    ];
    const result = aggregateRecipeStatusCounts(assets, ['2001']);
    expect(result.statusCounts.pending).toBe(0);
    expect(result.statusCounts.approved).toBe(1);
  });
});
