import React from "react";

const variantClasses = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  action: "btn-action",
  logout: "btn-logout",
  arrow: "btn-arrow",
  approve: "btn-approve",
  reject: "btn-reject",
  edit: "btn-edit",
  delete: "btn-delete",
  accent: {
    base:
      "inline-flex items-center justify-center gap-2 rounded-md border border-[var(--accent-color)] bg-[var(--accent-color)] font-semibold text-white shadow-sm transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar-bg)] disabled:cursor-not-allowed disabled:opacity-60",
    sizes: {
      sm: "px-3 py-1.5 text-xs",
      md: "px-3 py-2 text-sm",
      lg: "px-4 py-2 text-sm",
    },
  },
  neutral: {
    base:
      "inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)] disabled:cursor-not-allowed disabled:opacity-60",
    sizes: {
      sm: "px-3 py-1.5 text-xs",
      md: "px-3 py-2 text-sm",
    },
  },
  accentPill: {
    base:
      "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-color)] font-medium text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-opacity-40 disabled:cursor-not-allowed disabled:opacity-60",
    sizes: {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
    },
  },
  accentPillOutline: {
    base:
      "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--accent-color)] bg-white font-medium text-[var(--accent-color)] transition hover:bg-[var(--accent-color-10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-opacity-30 dark:border-[var(--accent-color)] dark:bg-transparent dark:text-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-60",
    sizes: {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
    },
  },
};

const resolveVariantClass = (variant, size) => {
  const config = variantClasses[variant];
  if (!config) {
    return '';
  }
  if (typeof config === 'string') {
    return config;
  }
  const sizeKey = size && config.sizes?.[size] ? size : 'md';
  const sizeClass = config.sizes?.[sizeKey] || '';
  return `${config.base} ${sizeClass}`.trim();
};

const Button = ({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...rest
}) => {
  const variantClass = resolveVariantClass(variant, size);
  const widthClass = fullWidth ? 'w-full' : '';
  const composedClassName = [variantClass, widthClass, className].filter(Boolean).join(' ');
  return <Component className={composedClassName} {...rest} />;
};

export default Button;
