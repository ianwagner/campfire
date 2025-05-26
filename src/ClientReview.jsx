import React from 'react';
import { useParams } from 'react-router-dom';
import Review from './Review';

const ClientReview = (props) => {
  const { groupId } = useParams();
  const reviewerName = props.user?.displayName || '';
  const { userRole } = props;
  return (
    <div className="min-h-screen">
      <Review
        {...props}
        groupId={groupId}
        reviewerName={reviewerName}
        userRole={userRole}
      />
    </div>
  );
};

export default ClientReview;
