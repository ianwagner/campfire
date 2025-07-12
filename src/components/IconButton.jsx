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

const IconButton = ({ as: Component = "button", className = "", children, ...props }) => {
  const containsText = hasText(children);
  const baseClasses = containsText
    ? "btn-secondary px-2 py-0.5 flex items-center gap-1"
    : "icon-btn";

  return (
    <Component className={`${baseClasses} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
};

export default IconButton;
