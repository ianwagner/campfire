import parseAdFilename from './parseAdFilename';

test('parses full filename', () => {
  const info = parseAdFilename('LGND_CM01_001_3x5_V1.png');
  expect(info).toEqual({
    brandCode: 'LGND',
    adGroupCode: 'CM01',
    recipeCode: '001',
    aspectRatio: '3x5',
    version: 1,
  });
});

test('handles missing version', () => {
  const info = parseAdFilename('LGND_CM01_001_3x5.png');
  expect(info.version).toBeUndefined();
  expect(info.aspectRatio).toBe('3x5');
});

test('detects hero ad without aspect ratio', () => {
  const info = parseAdFilename('LGND_CM01_001_V1.png');
  expect(info).toEqual({
    brandCode: 'LGND',
    adGroupCode: 'CM01',
    recipeCode: '001',
    aspectRatio: '',
    version: 1,
  });
});
