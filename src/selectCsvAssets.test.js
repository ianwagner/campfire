import { selectCsvAssets } from './AdminRecipeSetup.jsx';

test('selectCsvAssets returns urls when present', () => {
  const row = { imageUrls: ['http://ex.com/1.png', 'http://ex.com/2.png'] };
  const assets = selectCsvAssets(row, 2);
  expect(assets).toEqual([
    { adUrl: 'http://ex.com/1.png' },
    { adUrl: 'http://ex.com/2.png' },
  ]);
});

test('selectCsvAssets adds placeholders when no valid url', () => {
  const row = {};
  const assets = selectCsvAssets(row, 2);
  expect(assets).toEqual([{ needAsset: true }, { needAsset: true }]);
});

test('selectCsvAssets filters invalid urls', () => {
  const row = { imageUrls: ['not_a_url', 'http://ex.com/a.png'] };
  const assets = selectCsvAssets(row, 2);
  expect(assets).toEqual([{ adUrl: 'http://ex.com/a.png' }, { needAsset: true }]);
});
