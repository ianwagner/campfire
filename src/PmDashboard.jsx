import React from 'react';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import AdminDashboard from './AdminDashboard';

const PmDashboard = () => {
  const user = auth.currentUser;
  const { agencyId, brandCodes } = useUserRole(user?.uid);
  return (
    <AdminDashboard
      agencyId={agencyId}
      brandCodes={brandCodes}
      requireFilters
    />
  );
};

export default PmDashboard;
