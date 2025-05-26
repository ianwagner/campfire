import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import Review from './Review';
import AgencyTheme from './AgencyTheme';

const dummyUser = { uid: 'public', email: 'public@campfire' };

const PublicReview = () => {
  const { groupId } = useParams();
  const query = new URLSearchParams(useLocation().search);
  const agencyId = query.get('agency');
  const queryName = query.get('name');
  const storedName =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('reviewerName')
      : '';
  const initialName = queryName || storedName || '';
  const [reviewerName, setReviewerName] = useState(initialName);
  const [tempName, setTempName] = useState(initialName);
  const [anonError, setAnonError] = useState('');
  const didSignIn = useRef(false);

  useEffect(() => {
    if (!auth.currentUser && !didSignIn.current) {
      signInAnonymously(auth)
        .then(() => {
          didSignIn.current = true;
        })
        .catch((err) => {
          console.error('Anonymous sign-in failed', err);
          setAnonError(err.message);
        });
    }
    return () => {
      if (didSignIn.current && auth.currentUser?.isAnonymous) {
        signOut(auth).catch((err) =>
          console.error('Failed to sign out', err)
        );
      }
    };
  }, []);

  useEffect(() => {
    if (queryName) {
      setReviewerName(queryName);
    }
  }, [queryName]);

  useEffect(() => {
    if (reviewerName) {
      localStorage.setItem('reviewerName', reviewerName);
    }
  }, [reviewerName]);

  if (anonError) {
    return (
      <div className="p-4 text-center text-red-500">{anonError}</div>
    );
  }

  if (!reviewerName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-2">
        <label className="text-lg" htmlFor="reviewerName">Your Name</label>
        <input
          id="reviewerName"
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          className="w-full max-w-xs p-2 border rounded"
        />
        <button
          onClick={() => setReviewerName(tempName.trim())}
          className="btn-primary"
          disabled={!tempName.trim()}
        >
          Start Review
        </button>
      </div>
    );
  }

  return (
    <AgencyTheme agencyId={agencyId}>
      <Review user={dummyUser} groupId={groupId} reviewerName={reviewerName} />
    </AgencyTheme>
  );
};

export default PublicReview;
