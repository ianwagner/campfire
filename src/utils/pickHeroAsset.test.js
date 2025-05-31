import pickHeroAsset from './pickHeroAsset';

const make = (aspectRatio, filename) => ({ aspectRatio, filename: filename || `ad_${aspectRatio}.png` });

test('prefers 9x16 over others', () => {
  const list = [make('3x5'), make('9x16')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('9x16');
});

test('falls back to 1x1 when 9x16 and 3x5 missing', () => {
  const list = [make('1x1'), make('4x5')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('1x1');
});

test('returns first when no preferred aspect ratio found', () => {
  const list = [make('something'), make('other')];
  const hero = pickHeroAsset(list);
  expect(hero.aspectRatio).toBe('something');
});
