import React, { useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import Review from './Review';
import AgencyTheme from './AgencyTheme';

const dummyUser = { uid: 'public', email: 'public@campfire' };

const PublicReview = () => {
  const { groupId } = useParams();
  const agencyId = new URLSearchParams(useLocation().search).get('agency');
  const [name, setName] = useState(() => localStorage.getItem('reviewerName') || '');
  const [tempName, setTempName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = tempName.trim();
    if (trimmed) {
      localStorage.setItem('reviewerName', trimmed);
      setName(trimmed);
    }
  };

  return (
    <AgencyTheme agencyId={agencyId}>
      {!name ? (
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Your name"
          />
          <button type="submit" className="w-full btn-primary">
            Submit
          </button>
        </form>
      ) : (
        <Review user={dummyUser} groupId={groupId} reviewerName={name} />
      )}
    </AgencyTheme>
  );
};

export default PublicReview;
