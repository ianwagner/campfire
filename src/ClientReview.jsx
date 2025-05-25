import React from 'react';
import { useParams } from 'react-router-dom';
import Review from './Review';

const ClientReview = (props) => {
  const { groupId } = useParams();
  return (
    <div className="min-h-screen">
      <Review {...props} groupId={groupId} />
    </div>
  );
};

export default ClientReview;
