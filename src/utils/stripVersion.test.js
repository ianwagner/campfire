import stripVersion from './stripVersion';

test('removes version and extension', () => {
  expect(stripVersion('ad_V2.png')).toBe('ad');
});

test('handles filenames without version', () => {
  expect(stripVersion('ad.png')).toBe('ad');
});

test('is case insensitive', () => {
  expect(stripVersion('AD_v10.PDF')).toBe('AD');
});
