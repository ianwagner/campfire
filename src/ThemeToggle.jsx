import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import useTheme from './useTheme';

const ThemeToggle = ({ className = '', onToggle = null, variant = 'icon', ...buttonProps }) => {
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
  const Icon = resolvedTheme === 'dark' ? FiMoon : FiSun;
  if (variant === 'menu') {
    const label = 'Toggle theme';
    return (
      <button
        type="button"
        aria-label="Toggle dark mode"
        onClick={handleClick}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)] ${className}`}
        {...buttonProps}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={handleClick}
      className={`flex items-center justify-center rounded p-2 hover:bg-[var(--accent-color-10)] focus:outline-none active:bg-[var(--accent-color-10)] ${className}`}
      {...buttonProps}
    >
      <Icon />
    </button>
  );
};

export default ThemeToggle;
