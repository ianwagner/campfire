import pickHeroAsset from './pickHeroAsset';

const make = (aspectRatio, version = 1, filename) => ({
  aspectRatio,
  version,
  filename: filename || `ad_${aspectRatio}_V${version}.png`,
});

test('prefers 9x16 over others', () => {
  const list = [make('4x5'), make('9x16')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('9x16');
});

test('prefers 4x5 over 1x1 when 9x16 missing', () => {
  const list = [make('1x1'), make('4x5')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('4x5');
});

test('treats 3x5 as 4x5', () => {
  const list = [make('1x1'), make('3x5')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('3x5');
});

test('returns first when no preferred aspect ratio found', () => {
  const list = [make('something'), make('other')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('something');
});

test('prefers asset with no aspect ratio', () => {
  const list = [make('9x16'), { filename: 'LGND_CM01_001_V1.png' }];
  const hero = pickHeroAsset(list);
  expect(hero.filename).toBe('LGND_CM01_001_V1.png');
});

test('picks newest version when aspect ratios match', () => {
  const list = [make('9x16', 1), make('9x16', 3), make('9x16', 2)];
  const hero = pickHeroAsset(list);
  expect(hero.version).toBe(3);
});
