import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../src:firebase/src:firebase:config';

const Review = ({ user }) => {
  const [ads, setAds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const q = query(
          collection(db, 'adBatches'),
          where('clientId', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const list = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (Array.isArray(data.ads)) {
            list.push(...data.ads);
          }
        });
        setAds(list);
      } catch (err) {
        console.error('Failed to load ads', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.uid) {
      fetchAds();
    }
  }, [user]);

  const currentAd = ads[currentIndex];

  const submitResponse = async (responseType) => {
    if (!currentAd) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'responses'), {
        clientId: user.uid,
        adUrl: currentAd,
        response: responseType,
        comment: responseType === 'edit' ? comment : '',
        timestamp: serverTimestamp(),
      });
      setComment('');
      setShowComment(false);
      setCurrentIndex((i) => i + 1);
    } catch (err) {
      console.error('Failed to submit response', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  if (currentIndex >= ads.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <h2 className="text-2xl">Thank you for your feedback!</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      <img src={currentAd} alt="Ad" className="max-w-full h-auto" />
      <div className="space-x-2">
        <button
          onClick={() => submitResponse('approve')}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          disabled={submitting}
        >
          Approve
        </button>
        <button
          onClick={() => submitResponse('reject')}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          disabled={submitting}
        >
          Reject
        </button>
        <button
          onClick={() => setShowComment(true)}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          disabled={submitting}
        >
          Request Edit
        </button>
      </div>
      {showComment && (
        <div className="flex flex-col items-center space-y-2 w-full max-w-sm">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Add comments..."
            rows={3}
          />
          <button
            onClick={() => submitResponse('edit')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={submitting}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
};

export default Review;
