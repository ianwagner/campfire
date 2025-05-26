import React from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import ClientReview from './ClientReview';
import PublicReview from './PublicReview';

const ReviewRoute = () => {
  const user = auth.currentUser;
  const { role, brandCodes, loading } = useUserRole(user?.uid);
  const query = new URLSearchParams(useLocation().search);

  if (loading) return <div className="text-center mt-10">Loading...</div>;

  if (user) {
    return (
      <ClientReview user={user} brandCodes={brandCodes} userRole={role} />
    );
  }

  const agencyId = query.get('agency');
  return <PublicReview key={agencyId} />;
};

export default ReviewRoute;
