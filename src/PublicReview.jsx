import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import Review from './Review';
import AgencyTheme from './AgencyTheme';

// Track whether we've attempted anonymous auth across mounts to avoid
// hitting Firebase rate limits when React StrictMode double-mounts.
let attemptedAnonSignIn = false;

const PublicReview = () => {
  const { groupId } = useParams();
  const query = new URLSearchParams(useLocation().search);
  const agencyId = query.get('agency');
  const queryName = query.get('name');
  const queryEmail = query.get('email');
  const queryRole = query.get('role');
  const storedName =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('reviewerName')
      : '';
  const initialName = queryName || storedName || '';
  const [reviewerName, setReviewerName] = useState(initialName);
  const reviewerRole = queryRole || null;
  const [tempName, setTempName] = useState(initialName);
  const [anonError, setAnonError] = useState('');
  const didSignIn = useRef(false);

  useEffect(() => {
    if (!auth.currentUser && !attemptedAnonSignIn) {
      attemptedAnonSignIn = true;
      didSignIn.current = true;
      signInAnonymously(auth).catch((err) => {
        console.error('Anonymous sign-in failed', err);
        setAnonError(err.message);
        didSignIn.current = false;
        attemptedAnonSignIn = false;
      });
    }
    return () => {
      if (didSignIn.current && auth.currentUser?.isAnonymous) {
        signOut(auth)
          .catch((err) => console.error('Failed to sign out', err))
          .finally(() => {
            attemptedAnonSignIn = false;
          });
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

  const userObj = { uid: 'public', email: queryEmail || 'public@campfire' };

  return (
    <AgencyTheme agencyId={agencyId}>
      <Review
        user={userObj}
        groupId={groupId}
        reviewerName={reviewerName}
        userRole={reviewerRole}
      />
    </AgencyTheme>
  );
};

export default PublicReview;
