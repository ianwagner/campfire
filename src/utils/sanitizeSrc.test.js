import sanitizeSrc from './sanitizeSrc';

describe('sanitizeSrc', () => {
  test('appends alt=media to Firebase Storage URLs missing query', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/foo/o/bar.png';
    expect(sanitizeSrc(url)).toBe(`${url}?alt=media`);
  });

  test('does not modify URLs that already include alt=media', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/foo/o/bar.png?alt=media';
    expect(sanitizeSrc(url)).toBe(url);
  });
});
