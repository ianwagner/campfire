import React from 'react';
import { useParams } from 'react-router-dom';
import Review from './Review';

const ClientReview = (props) => {
  const { groupId } = useParams();
  return <Review {...props} groupId={groupId} />;
};

export default ClientReview;
