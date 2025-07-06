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
};

const Button = ({ as: Component = 'button', variant = 'primary', className = '', ...rest }) => {
  const variantClass = variantClasses[variant] || '';
  return <Component className={`${variantClass} ${className}`.trim()} {...rest} />;
};

export default Button;
