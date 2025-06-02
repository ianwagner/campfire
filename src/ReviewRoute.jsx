import React, { useState, useEffect } from 'react';
import LoadingOverlay from "./LoadingOverlay";
import { auth } from './firebase/config';
import { signInAnonymously } from 'firebase/auth';
import useUserRole from './useUserRole';
import ReviewPage from './ReviewPage';

const ReviewRoute = () => {
  const [user, setUser] = useState(auth.currentUser);
  const [signingIn, setSigningIn] = useState(!auth.currentUser);

  useEffect(() => {
    if (!user) {
      signInAnonymously(auth)
        .then(() => {
          setUser(auth.currentUser);
          setSigningIn(false);
        })
        .catch((err) => {
          console.error('Anonymous sign-in failed', err);
          setSigningIn(false);
        });
    }
  }, [user]);

  const isAnonymous = user?.isAnonymous;
  const { role, brandCodes, loading } = useUserRole(isAnonymous ? null : user?.uid);
  if (loading || signingIn) return <LoadingOverlay />;

  return (
    <ReviewPage userRole={isAnonymous ? null : role} brandCodes={isAnonymous ? [] : brandCodes} />
  );
};

export default ReviewRoute;
