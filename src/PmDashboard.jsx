import React from 'react';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import AdminDashboard from './AdminDashboard';

const PmDashboard = () => {
  const user = auth.currentUser;
  const { agencyId } = useUserRole(user?.uid);
  return <AdminDashboard agencyId={agencyId} />;
};

export default PmDashboard;
