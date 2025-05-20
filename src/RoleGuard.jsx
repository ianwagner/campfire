import React from 'react';
import { Navigate } from 'react-router-dom';

const RoleGuard = ({ loading, userRole, requiredRole, children }) => {
  if (loading) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  if (userRole && userRole !== requiredRole) {
    return <Navigate to={`/dashboard/${userRole}`} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
