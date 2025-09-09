import detectMissingRatios from './detectMissingRatios';

describe('detectMissingRatios', () => {
  const makeAsset = (recipe, ratio, status = 'approved', filename = '') => ({
    recipeCode: recipe,
    aspectRatio: ratio,
    status,
    filename: filename || `BRND_GRP_${recipe}_${ratio}_V1.png`,
  });

  const makeFile = (recipe, ratio, version = 2) => ({
    name: `BRND_GRP_${recipe}_${ratio}_V${version}.png`,
  });

  it('identifies missing ratios for revised uploads', () => {
    const assets = [makeAsset('001', '9x16'), makeAsset('001', '1x1')];
    const files = [makeFile('001', '9x16')];
    const missing = detectMissingRatios(files, assets);
    expect(missing).toEqual({ '001': ['1x1'] });
  });

  it('returns empty object when all ratios provided', () => {
    const assets = [makeAsset('002', '9x16'), makeAsset('002', '1x1')];
    const files = [makeFile('002', '9x16'), makeFile('002', '1x1')];
    const missing = detectMissingRatios(files, assets);
    expect(missing).toEqual({});
  });
});
