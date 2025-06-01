import React from 'react';
import LoadingOverlay from "./LoadingOverlay";
import { useLocation } from 'react-router-dom';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import ClientReview from './ClientReview';
import PublicReview from './PublicReview';

const ReviewRoute = () => {
  const user = auth.currentUser;
  const isAnonymous = user?.isAnonymous;
  const { role, brandCodes, loading } = useUserRole(isAnonymous ? null : user?.uid);
  const query = new URLSearchParams(useLocation().search);

  if (loading) return <LoadingOverlay />;

  if (user && !isAnonymous) {
    return (
      <ClientReview user={user} brandCodes={brandCodes} userRole={role} />
    );
  }

  const agencyId = query.get('agency');
  return <PublicReview key={agencyId} />;
};

export default ReviewRoute;
