import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import OptimizedImage from './OptimizedImage.jsx';

test('applies class to picture and img elements', () => {
  const { container } = render(
    <OptimizedImage pngUrl="https://example.com/test.png" className="w-8 h-8" />
  );
  const picture = container.querySelector('picture');
  const img = container.querySelector('img');
  expect(picture).toHaveClass('w-8');
  expect(img).toHaveClass('w-8');
});
