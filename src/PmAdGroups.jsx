import React from 'react';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import AgencyAdGroups from './AgencyAdGroups';

const PmAdGroups = () => {
  const user = auth.currentUser;
  const { agencyId } = useUserRole(user?.uid);
  return <AgencyAdGroups agencyId={agencyId} />;
};

export default PmAdGroups;
