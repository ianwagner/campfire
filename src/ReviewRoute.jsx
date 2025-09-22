import React, { useState, useEffect } from 'react';
import LoadingOverlay from "./LoadingOverlay";
import { auth } from './firebase/config';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import useUserRole from './useUserRole';
import ReviewPage from './ReviewPage';

const ReviewRoute = () => {
  const [user, setUser] = useState(auth.currentUser);
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setAuthError(null);
      setInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (initializing || signingIn || user) {
      return;
    }

    setSigningIn(true);
    signInAnonymously(auth)
      .catch((err) => {
        console.error('Anonymous sign-in failed', err);
        setAuthError(err.message || 'Anonymous sign-in failed');
      })
      .finally(() => {
        setSigningIn(false);
      });
  }, [initializing, user, signingIn]);

  const isAnonymous = user?.isAnonymous;
  const { role, brandCodes, loading } = useUserRole(isAnonymous ? null : user?.uid);
  const authLoading = initializing || signingIn;
  if (loading) return <LoadingOverlay />;

  return (
    <ReviewPage
      userRole={isAnonymous ? null : role}
      brandCodes={isAnonymous ? [] : brandCodes}
      user={user}
      authLoading={authLoading}
      authError={authError}
    />
  );
};

export default ReviewRoute;
