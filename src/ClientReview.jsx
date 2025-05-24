import React from 'react';
import { useParams } from 'react-router-dom';
import Review from './Review';
import Sidebar from './Sidebar';

const ClientReview = (props) => {
  const { groupId } = useParams();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-grow">
        <Review {...props} groupId={groupId} />
      </div>
    </div>
  );
};

export default ClientReview;
