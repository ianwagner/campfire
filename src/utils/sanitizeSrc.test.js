import sanitizeSrc from './sanitizeSrc';

describe('sanitizeSrc', () => {
  test('appends alt=media to Firebase Storage URLs missing query', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/foo/o/bar.png';
    expect(sanitizeSrc(url)).toBe(`${url}?alt=media`);
  });

  test('appends alt=media to storage.googleapis.com URLs', () => {
    const url = 'https://storage.googleapis.com/custom-bucket/path/to/ad.png';
    expect(sanitizeSrc(url)).toBe(`${url}?alt=media`);
  });

  test('does not modify URLs that already include alt=media', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/foo/o/bar.png?alt=media';
    expect(sanitizeSrc(url)).toBe(url);
  });

  test('preserves existing queries on storage.googleapis.com URLs', () => {
    const url = 'https://storage.googleapis.com/custom-bucket/path/ad.png?token=abc';
    expect(sanitizeSrc(url)).toBe(`${url}&alt=media`);
  });
});
