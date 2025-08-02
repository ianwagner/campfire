import React from "react";

const hasText = (children) => {
  return React.Children.toArray(children).some((child) => {
    if (typeof child === "string" || typeof child === "number") return true;
    if (React.isValidElement(child)) {
      return hasText(child.props.children);
    }
    return false;
  });
};

const IconButton = React.forwardRef(
  ({ as: Component = "button", className = "", children, type, ...props }, ref) => {
    const containsText = hasText(children);
    const baseClasses = containsText
      ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 hover:bg-[var(--accent-color-10)] hover:text-gray-900 dark:hover:text-white focus:outline-none active:bg-[var(--accent-color-10)]"
      : "p-2 rounded flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-[var(--accent-color-10)] hover:text-gray-900 dark:hover:text-white focus:outline-none active:bg-[var(--accent-color-10)]";

    const computedType = Component === "button" ? type || "button" : undefined;

    return (
      <Component
        ref={ref}
        className={`${baseClasses} ${className}`.trim()}
        type={computedType}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

export default IconButton;
