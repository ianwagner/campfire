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

test('useTheme does not throw when storage read fails', () => {
  const originalGetItem = localStorage.getItem;
  localStorage.getItem = jest.fn(() => {
    throw new Error('failed');
  });

  expect(() => render(<ThemeDisplay />)).not.toThrow();

  localStorage.getItem = originalGetItem;
});

test('setTheme does not throw when storage write fails', () => {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = jest.fn(() => {
    throw new Error('failed');
  });

  const ThemeSetter = () => {
    const { setTheme } = useTheme();
    return <button onClick={() => setTheme('dark')}>set</button>;
  };

  expect(() => {
    render(<ThemeSetter />);
    screen.getByText('set').click();
  }).not.toThrow();

  localStorage.setItem = originalSetItem;
});
