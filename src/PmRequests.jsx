import React from 'react';
import { auth } from './firebase/config';
import AdminRequests from './AdminRequests';

const PmRequests = () => {
  const user = auth.currentUser;
  return (
    <AdminRequests
      filterCreatorId={user?.uid}
    />
  );
};

export default PmRequests;

