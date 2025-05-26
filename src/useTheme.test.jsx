import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import useTheme from './useTheme';

const ThemeDisplay = () => {
  const { resolvedTheme } = useTheme();
  return <span data-testid="theme">{resolvedTheme}</span>;
};

test('defaults to light when matchMedia is unavailable', () => {
  const originalMatchMedia = window.matchMedia;
  delete window.matchMedia;
  localStorage.setItem('theme', 'system');

  render(<ThemeDisplay />);

  expect(screen.getByTestId('theme')).toHaveTextContent('light');

  if (originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  }
});
