import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { multiFactor } from 'firebase/auth';

const RequireMfa = ({ user, role, children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (
      user &&
      ['admin', 'client', 'agency', 'designer', 'manager'].includes(role) &&
      multiFactor(user).enrolledFactors.length === 0 &&
      location.pathname !== '/mfa-settings'
    ) {
      navigate('/mfa-settings', { replace: true });
    }
  }, [user, role, location.pathname, navigate]);

  return <>{children}</>;
};

export default RequireMfa;
