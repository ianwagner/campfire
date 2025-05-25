import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import Review from './Review';
import AgencyTheme from './AgencyTheme';

const dummyUser = { uid: 'public', email: 'public@campfire' };

const PublicReview = () => {
  const { groupId } = useParams();
  const agencyId = new URLSearchParams(useLocation().search).get('agency');
  return (
    <AgencyTheme agencyId={agencyId}>
      <Review user={dummyUser} groupId={groupId} />
    </AgencyTheme>
  );
};

export default PublicReview;
