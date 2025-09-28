const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

describe('Review.jsx syntax', () => {
  it('parses as valid JSX', () => {
    const filePath = path.join(__dirname, 'Review.jsx');
    const code = fs.readFileSync(filePath, 'utf8');
    expect(() =>
      babel.transformSync(code, {
        filename: 'Review.jsx',
        presets: ['@babel/preset-react'],
      }),
    ).not.toThrow();
  });
});
