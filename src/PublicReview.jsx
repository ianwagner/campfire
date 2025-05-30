import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import Review from './Review';

import ThemeToggle from './ThemeToggle';
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
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState('');
  const didSignIn = useRef(false);

  useEffect(() => {
    if (!auth.currentUser && !didSignIn.current) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Starting anonymous sign-in');
      }
      setAuthStatus('Signing in...');
      didSignIn.current = true;
      signInAnonymously(auth)
        .then(() => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Anonymous sign-in success');
          }
          setAuthStatus('');
          setLoading(false);
        })
        .catch((err) => {
          console.error('Anonymous sign-in failed', err);
          setAuthStatus('Sign-in failed');
          setAnonError(err.message);
          didSignIn.current = false;
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      // Keep the anonymous session active across page visits so we don't
      // repeatedly create new anonymous accounts. Leaving the user signed in
      // avoids hitting Firebase's "too-many-requests" throttle.
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

  if (loading) {
    return (
      <div className="text-center mt-10">
        {authStatus || 'Loading...'}
      </div>
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
          Continue as Guest
        </button>
      </div>
    );
  }

  const userObj = { uid: 'public', email: queryEmail || 'public@campfire' };

  return (
    <div className="min-h-screen relative">
      <ThemeToggle className="absolute top-2 right-2" />
      <Review
        user={userObj}
        groupId={groupId}
        reviewerName={reviewerName}
        userRole={reviewerRole}
        agencyId={agencyId}
      />
    </div>
  );

};

export default PublicReview;
