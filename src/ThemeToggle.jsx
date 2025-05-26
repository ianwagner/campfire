import React from 'react';
import useTheme from './useTheme';

const ThemeToggle = ({ className = '' }) => {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={toggleTheme}
      className={`p-2 rounded ${className}`}
    >
      {resolvedTheme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
};

export default ThemeToggle;
