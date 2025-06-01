import React from 'react';
import LoadingOverlay from "./LoadingOverlay";
import { Navigate } from 'react-router-dom';

const RoleGuard = ({ loading, userRole, requiredRole, isAdmin = false, children }) => {
  if (loading) {
    return <LoadingOverlay />;
  }

  const allowedRoles = Array.isArray(requiredRole)
    ? requiredRole
    : [requiredRole];

  const roleAllowed =
    (userRole && allowedRoles.includes(userRole)) ||
    (allowedRoles.includes('admin') && isAdmin);

  if (requiredRole && !roleAllowed) {
    const redirectRole = userRole || (isAdmin ? 'admin' : '');
    return <Navigate to={`/dashboard/${redirectRole}`} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
