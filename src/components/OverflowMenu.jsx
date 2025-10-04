import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiMoreHorizontal } from "react-icons/fi";
import ThemeToggle from "../ThemeToggle.jsx";

const joinClasses = (...classes) => classes.filter(Boolean).join(" ");

const OverflowMenu = forwardRef(
  (
    {
      actions = [],
      className = "",
      buttonAriaLabel = "Open actions menu",
      buttonClassName = "btn-action flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]",
      buttonIcon = <FiMoreHorizontal className="h-5 w-5" />,
      includeThemeToggle = true,
      menuClassName = "",
      menuRole = "menu",
      align = "right",
      onOpenChange,
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    const normalizedActions = useMemo(
      () => actions.filter(Boolean),
      [actions],
    );

    useEffect(() => {
      if (!open) {
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
        setOpen(false);
      };
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handleDocumentClick);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleDocumentClick);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [open]);

    useEffect(() => {
      if (typeof onOpenChange === "function") {
        onOpenChange(open);
      }
    }, [open, onOpenChange]);

    useImperativeHandle(
      ref,
      () => ({
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen((prev) => !prev),
        isOpen: () => open,
        focusButton: () => {
          if (buttonRef.current) {
            buttonRef.current.focus();
          }
        },
      }),
      [open],
    );

    const alignmentClass = align === "left" ? "left-0" : "right-0";

    const handleToggle = () => {
      setOpen((prev) => !prev);
    };

    const handleActionSelect = (action) => {
      if (action.disabled) {
        return;
      }
      if (typeof action.onSelect === "function") {
        action.onSelect();
      }
      setOpen(false);
    };

    return (
      <div className={joinClasses("relative", className)}>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={buttonAriaLabel}
          onClick={handleToggle}
          ref={buttonRef}
          className={buttonClassName}
        >
          {buttonIcon}
        </button>
        {open && (
          <div
            ref={menuRef}
            className={joinClasses(
              "absolute mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-md focus:outline-none dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]",
              alignmentClass,
              menuClassName,
            )}
            role={menuRole}
          >
            {normalizedActions.map((action) => {
              const { key, label, Icon, disabled, className: actionClassName } = action;
              const handleClick = () => handleActionSelect(action);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={handleClick}
                  disabled={disabled}
                  className={joinClasses(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]",
                    actionClassName,
                  )}
                  role="menuitem"
                >
                  {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                  {label}
                </button>
              );
            })}
            {includeThemeToggle && (
              <div className="mt-2 border-t border-gray-200 pt-2 dark:border-[var(--border-color-default)]">
                <ThemeToggle variant="menu" role="menuitem" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

OverflowMenu.displayName = "OverflowMenu";

export default OverflowMenu;
