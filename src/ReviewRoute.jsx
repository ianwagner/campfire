import React from 'react';
import LoadingOverlay from "./LoadingOverlay";
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import ReviewPage from './ReviewPage';

const ReviewRoute = () => {
  const user = auth.currentUser;
  const isAnonymous = user?.isAnonymous;
  const { role, brandCodes, loading } = useUserRole(isAnonymous ? null : user?.uid);
  if (loading) return <LoadingOverlay />;

  return (
    <ReviewPage userRole={isAnonymous ? null : role} brandCodes={isAnonymous ? [] : brandCodes} />
  );
};

export default ReviewRoute;
