import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import Review from './Review';
import LoadingOverlay from './LoadingOverlay';
import ThemeToggle from './ThemeToggle';

const ReviewPage = ({ userRole = null, brandCodes = [] }) => {
  const { groupId } = useParams();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [reviewerName, setReviewerName] = useState('');
  const [tempName, setTempName] = useState('');
  const [agencyId, setAgencyId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!auth.currentUser);

  useEffect(() => {
    if (!currentUser) {
      signInAnonymously(auth)
        .then(() => {
          setCurrentUser(auth.currentUser);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Anonymous sign-in failed', err);
          setError(err.message);
          setLoading(false);
        });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!groupId) { setAgencyId(null); return; }
    const loadAgency = async () => {
      try {
        const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
        if (!groupSnap.exists()) { setAgencyId(null); return; }
        const code = groupSnap.data().brandCode;
        if (!code) { setAgencyId(null); return; }
        const q = query(collection(db, 'brands'), where('code', '==', code));
        const bSnap = await getDocs(q);
        if (!bSnap.empty) {
          setAgencyId(bSnap.docs[0].data().agencyId || null);
        } else {
          setAgencyId(null);
        }
      } catch (err) {
        console.error('Failed to fetch agency', err);
        setAgencyId(null);
      }
    };
    loadAgency();
  }, [groupId]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.isAnonymous) {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('reviewerName') : '';
      if (stored) {
        setReviewerName(stored);
        setTempName(stored);
      }
    } else {
      setReviewerName(currentUser.displayName || '');
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.isAnonymous && reviewerName) {
      localStorage.setItem('reviewerName', reviewerName);
    }
  }, [reviewerName, currentUser]);

  if (error) {
    return <div className="p-4 text-center text-red-500">{error}</div>;
  }

  if (loading) {
    return <LoadingOverlay />;
  }

  if (currentUser?.isAnonymous && !reviewerName) {
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

  const userObj = currentUser?.isAnonymous
    ? { uid: currentUser.uid || 'public', email: 'public@campfire' }
    : currentUser;

  return (
    <div className="min-h-screen relative">
      {currentUser?.isAnonymous && <ThemeToggle className="absolute top-2 right-2" />}
      <Review
        user={userObj}
        groupId={groupId}
        reviewerName={reviewerName}
        userRole={currentUser?.isAnonymous ? null : userRole}
        brandCodes={currentUser?.isAnonymous ? [] : brandCodes}
        agencyId={agencyId}
      />
    </div>
  );
};

export default ReviewPage;
