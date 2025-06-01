import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
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
      {resolvedTheme === 'dark' ? <FiMoon /> : <FiSun />}
    </button>
  );
};

export default ThemeToggle;
