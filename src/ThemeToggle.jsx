import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import useTheme from './useTheme';

const ThemeToggle = ({ className = '', onToggle = null }) => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const handleClick = () => {
    toggleTheme();
    if (typeof onToggle === 'function') {
      try {
        onToggle();
      } catch (err) {
        console.error('Theme toggle callback failed', err);
      }
    }
  };
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={handleClick}
      className={`p-2 rounded hover:bg-[var(--accent-color-10)] focus:outline-none active:bg-[var(--accent-color-10)] ${className}`}
    >
      {resolvedTheme === 'dark' ? <FiMoon /> : <FiSun />}
    </button>
  );
};

export default ThemeToggle;
