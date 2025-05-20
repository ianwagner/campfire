import React from 'react';
import Review from './Review';

const ClientDashboard = ({ user }) => {
  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Client Dashboard</h1>
      <Review user={user} />
    </div>
  );
};

export default ClientDashboard;
