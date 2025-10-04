import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMoreHorizontal } from 'react-icons/fi';
import ThemeToggle from '../ThemeToggle.jsx';

const noop = () => {};

const MoreActionsMenu = ({
  actions = [],
  align = 'right',
  buttonAriaLabel = 'Open actions menu',
  buttonClassName = '',
  buttonContent = null,
  className = '',
  menuClassName = '',
  menuRole = 'menu',
  onOpenChange = noop,
  open,
  showThemeToggle = true,
  themeToggleProps = {},
}) => {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const menuOpen = isControlled ? open : internalOpen;

  const setOpenState = useCallback(
    (next) => {
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange(next);
    },
    [isControlled, onOpenChange],
  );

  const closeMenu = useCallback(() => {
    if (!menuOpen) return;
    setOpenState(false);
  }, [menuOpen, setOpenState]);

  const toggleMenu = useCallback(() => {
    setOpenState(!menuOpen);
  }, [menuOpen, setOpenState]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const handleDocumentClick = (event) => {
      const target = event.target;
      if (
        (menuRef.current && menuRef.current.contains(target)) ||
        (buttonRef.current && buttonRef.current.contains(target))
      ) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  const resolvedActions = useMemo(
    () => actions.filter(Boolean),
    [actions],
  );

  const handleActionSelect = useCallback(
    (action) => {
      if (!action || action.disabled) return;
      if (action.closeOnSelect !== false) {
        closeMenu();
      }
      if (typeof action.onSelect === 'function') {
        action.onSelect();
      }
    },
    [closeMenu],
  );

  const hasMenuContent = resolvedActions.length > 0 || showThemeToggle;

  if (!hasMenuContent) {
    return null;
  }

  return (
    <div className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        ref={buttonRef}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        aria-label={buttonAriaLabel}
        onClick={toggleMenu}
        className={buttonClassName || 'btn-action flex items-center justify-center rounded-full p-2'}
      >
        {buttonContent || <FiMoreHorizontal className="h-5 w-5" />}
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          role={menuRole}
          className={`absolute mt-2 rounded-lg border border-gray-200 bg-white p-2 shadow-md focus:outline-none dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] ${
            align === 'left' ? 'left-0' : 'right-0'
          } ${menuClassName}`.trim()}
        >
          {resolvedActions.map((action) => {
            const { key, label, Icon, disabled } = action;
            return (
              <button
                key={key || label}
                type="button"
                role="menuitem"
                onClick={() => handleActionSelect(action)}
                disabled={Boolean(disabled)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
                  disabled
                    ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]'
                }`}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                <span>{label}</span>
              </button>
            );
          })}
          {showThemeToggle && (
            <div className="mt-2 border-t border-gray-200 pt-2 dark:border-[var(--border-color-default)]">
              <ThemeToggle variant="menu" role="menuitem" {...themeToggleProps} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MoreActionsMenu;
