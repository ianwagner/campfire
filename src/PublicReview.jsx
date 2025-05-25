import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import Review from './Review';
import AgencyTheme from './AgencyTheme';

const dummyUser = { uid: 'public', email: 'public@campfire' };

const PublicReview = () => {
  const { groupId } = useParams();
  const query = new URLSearchParams(useLocation().search);
  const agencyId = query.get('agency');
  const reviewerName = query.get('name') || '';
  return (
    <AgencyTheme agencyId={agencyId}>
      <Review user={dummyUser} groupId={groupId} reviewerName={reviewerName} />
    </AgencyTheme>
  );
};

export default PublicReview;
