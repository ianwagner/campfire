// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';

const Review = ({ user, brandCodes = [] }) => {
  const [ads, setAds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState([]);
  const [secondPass, setSecondPass] = useState(false);
  const [groupResults, setGroupResults] = useState({});

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const batchQuery = query(
          collection(db, 'adBatches'),
          where('brandCode', 'in', brandCodes)
        );
        const batchSnap = await getDocs(batchQuery);

        const adsPerBatch = await Promise.all(
          batchSnap.docs.map(async (batchDoc) => {
            const adsSnap = await getDocs(
              collection(db, 'adBatches', batchDoc.id, 'ads')
            );
            return adsSnap.docs.map((adDoc) => ({
              ...adDoc.data(),
              ...(batchDoc.data().brandCode
                ? { brandCode: batchDoc.data().brandCode }
                : {}),
            }));
          })
        );

        const groupQuery = query(
          collection(db, 'adGroups'),
          where('brandCode', 'in', brandCodes),
          where('status', '==', 'ready')
        );
        const groupSnap = await getDocs(groupQuery);

        const adsPerGroup = await Promise.all(
          groupSnap.docs.map(async (groupDoc) => {
            const assetsSnap = await getDocs(
              query(
                collection(db, 'adGroups', groupDoc.id, 'assets'),
                where('status', '==', 'pending')
              )
            );
            return assetsSnap.docs.map((assetDoc) => ({
              ...assetDoc.data(),
              firebaseUrl: assetDoc.data().firebaseUrl,
              ...(groupDoc.data().brandCode
                ? { brandCode: groupDoc.data().brandCode }
                : {}),
              adGroupId: groupDoc.id,
              adGroupName: groupDoc.data().name || 'Untitled',
            }));
          })
        );

        const list = [...adsPerBatch.flat(), ...adsPerGroup.flat()];
        setAds(list);
      } catch (err) {
        console.error('Failed to load ads', err);
      } finally {
        setLoading(false);
      }
    };

    if (!user?.uid || brandCodes.length === 0) {
      setAds([]);
      setLoading(false);
      return;
    }

    fetchAds();
  }, [user, brandCodes]);

  const currentAd = ads[currentIndex];
  const adUrl =
    currentAd && typeof currentAd === 'object'
      ? currentAd.adUrl || currentAd.firebaseUrl
      : currentAd;
  const brandCode =
    currentAd && typeof currentAd === 'object' ? currentAd.brandCode : undefined;

  const submitResponse = async (responseType) => {
    if (!currentAd) return;
    setSubmitting(true);
    const respObj = {
      adUrl,
      response: responseType,
      comment: responseType === 'edit' ? comment : '',
      pass: secondPass ? 'second' : 'initial',
      ...(brandCode ? { brandCode } : {}),
    };
    try {
      await addDoc(collection(db, 'responses'), {
        ...respObj,
        timestamp: serverTimestamp(),
      });
      setResponses((prev) => [...prev, respObj]);
      if (currentAd.adGroupId) {
        setGroupResults((prev) => {
          const existing = prev[currentAd.adGroupId] || {
            id: currentAd.adGroupId,
            name: currentAd.adGroupName || 'Untitled',
            thumbnail: currentAd.firebaseUrl || adUrl,
            approved: 0,
          };
          return {
            ...prev,
            [currentAd.adGroupId]: {
              ...existing,
              thumbnail: existing.thumbnail || currentAd.firebaseUrl || adUrl,
              approved:
                existing.approved + (responseType === 'approve' ? 1 : 0),
            },
          };
        });
      }
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

  if (!ads || ads.length === 0) {
    return <div>No ads assigned to your account.</div>;
  }

  if (currentIndex >= ads.length) {
    const rejectedAds = responses
      .filter((r) => r.response === 'reject')
      .map((r) => r.adUrl);

    const handleReviewRejected = () => {
      setAds(rejectedAds);
      setCurrentIndex(0);
      setSecondPass(true);
      setResponses([]);
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <h2 className="text-2xl">Thank you for your feedback!</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-4xl">
          {Object.values(groupResults).map((g) => (
            <div key={g.id} className="border rounded shadow p-4 flex flex-col items-center">
              {g.thumbnail && (
                <img
                  src={g.thumbnail}
                  alt={g.name}
                  className="w-full h-32 object-cover mb-2 rounded"
                />
              )}
              <h3 className="font-semibold mb-1 text-center">{g.name}</h3>
              <p className="text-sm">Approved: {g.approved}</p>
            </div>
          ))}
        </div>
        {!secondPass && rejectedAds.length > 0 && (
          <button
            onClick={handleReviewRejected}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Review Rejected Ads
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      <img
        src={adUrl}
        alt="Ad"
        className="max-w-full max-h-[80vh] mx-auto rounded shadow"
      />
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
