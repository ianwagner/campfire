import React from 'react';
import { useParams } from 'react-router-dom';
import Review from './Review';

const ClientReview = ({ user }) => {
  const { groupId } = useParams();
  return <Review user={user} groupId={groupId} />;
};

export default ClientReview;
