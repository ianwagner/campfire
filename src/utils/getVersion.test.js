import getVersion from './getVersion';

// Should use explicit version when available
// and parse from filename when missing.

test('returns provided version on object', () => {
  expect(getVersion({ version: 3 })).toBe(3);
});

test('parses version from filename', () => {
  expect(getVersion({ filename: 'ad_V2.png' })).toBe(2);
  expect(getVersion('ad_V4.jpg')).toBe(4);
});

test('defaults to 1 when version missing', () => {
  expect(getVersion({ filename: 'ad.png' })).toBe(1);
  expect(getVersion('ad.png')).toBe(1);
  expect(getVersion({})).toBe(1);
});
