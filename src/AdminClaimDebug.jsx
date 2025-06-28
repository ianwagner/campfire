import React, { useEffect } from 'react';
import { auth } from './firebase/config';
import { getIdTokenResult } from 'firebase/auth';

const AdminClaimDebug = () => {
  useEffect(() => {
    const checkClaim = async () => {
      const user = auth.currentUser;
      if (!user) {
        console.log('No user signed in');
        return;
      }
      try {
        const result = await getIdTokenResult(user, true);
        console.log('admin claim:', result.claims.admin, 'uid:', auth.currentUser.uid);
      } catch (err) {
        console.error('Failed to get ID token', err);
      }
    };
    checkClaim();
  }, []);

  return null;
};

export default AdminClaimDebug;
