import React from 'react';
import LoadingOverlay from "./LoadingOverlay";
import { Navigate } from 'react-router-dom';

const RoleGuard = ({ loading, userRole, requiredRole, children }) => {
  if (loading) {
    return <LoadingOverlay />;
  }

  const allowedRoles = Array.isArray(requiredRole)
    ? requiredRole
    : [requiredRole];

  if (
    requiredRole &&
    userRole &&
    !allowedRoles.includes(userRole)
  ) {
    return <Navigate to={`/dashboard/${userRole}`} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
