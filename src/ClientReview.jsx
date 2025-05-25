import React from 'react';
import { useParams } from 'react-router-dom';
import Review from './Review';

const ClientReview = (props) => {
  const { groupId } = useParams();
  const reviewerName = props.user?.displayName || '';
  return (
    <div className="min-h-screen">
      <Review {...props} groupId={groupId} reviewerName={reviewerName} />
    </div>
  );
};

export default ClientReview;
