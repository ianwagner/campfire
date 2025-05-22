// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';

const Review = ({ user, brandCodes = [], groupId = null }) => {
  const [ads, setAds] = useState([]); // full list of ads
  const [reviewAds, setReviewAds] = useState([]); // ads being reviewed in the current pass
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [clientNote, setClientNote] = useState('');
  const [showClientNote, setShowClientNote] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [rejectionStreak, setRejectionStreak] = useState(0);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState({}); // map of adUrl -> response object

  useEffect(() => {
    const fetchAds = async () => {
      try {
        let list = [];
        if (groupId) {
          const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
          if (groupSnap.exists()) {
            const assetsSnap = await getDocs(
              query(
                collection(db, 'adGroups', groupId, 'assets'),
                where('status', '==', 'ready')
              )
            );
            list = assetsSnap.docs.map((assetDoc) => ({
              ...assetDoc.data(),
              assetId: assetDoc.id,
              adGroupId: groupId,
              groupName: groupSnap.data().name,
              firebaseUrl: assetDoc.data().firebaseUrl,
              ...(groupSnap.data().brandCode
                ? { brandCode: groupSnap.data().brandCode }
                : {}),
            }));
          }
        } else {
          const batchQuery = query(
            collection(db, 'adBatches'),
            where('brandCode', 'in', brandCodes)
          );
          const groupQuery = query(
            collection(db, 'adGroups'),
            where('brandCode', 'in', brandCodes),
            where('status', '==', 'ready')
          );

          const [batchSnap, groupSnap] = await Promise.all([
            getDocs(batchQuery),
            getDocs(groupQuery),
          ]);

          const [adsPerBatch, adsPerGroup] = await Promise.all([
            Promise.all(
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
            ),
            Promise.all(
              groupSnap.docs.map(async (groupDoc) => {
                const assetsSnap = await getDocs(
                  query(
                    collection(db, 'adGroups', groupDoc.id, 'assets'),
                    where('status', '==', 'ready')
                  )
                );
                return assetsSnap.docs.map((assetDoc) => ({
                  ...assetDoc.data(),
                  assetId: assetDoc.id,
                  adGroupId: groupDoc.id,
                  groupName: groupDoc.data().name,
                  firebaseUrl: assetDoc.data().firebaseUrl,
                  ...(groupDoc.data().brandCode
                    ? { brandCode: groupDoc.data().brandCode }
                    : {}),
                }));
              })
            ),
          ]);

          list = [...adsPerBatch.flat(), ...adsPerGroup.flat()];
        }

        setAds(list);

        const lastLogin = user?.metadata?.lastSignInTime
          ? new Date(user.metadata.lastSignInTime)
          : null;

        let filtered = list;
        let newer = [];
        if (lastLogin) {
          newer = list.filter((a) => {
            const updated = a.lastUpdatedAt?.toDate
              ? a.lastUpdatedAt.toDate()
              : a.lastUpdatedAt instanceof Date
              ? a.lastUpdatedAt
              : null;
            return updated && updated > lastLogin;
          });
          if (newer.length > 0) {
            filtered = newer;
          }
        }

        if (newer.length === 0) {
          const initial = {};
          list.forEach((ad) => {
            let resp;
            if (ad.status === 'approved') resp = 'approve';
            else if (ad.status === 'rejected') resp = 'reject';
            else if (ad.status === 'edit_requested') resp = 'edit';
            if (resp) {
              const url = ad.adUrl || ad.firebaseUrl;
              initial[url] = { adUrl: url, response: resp };
            }
          });
          setResponses(initial);
        }

        setReviewAds(filtered);
        setCurrentIndex(0);
      } catch (err) {
        console.error('Failed to load ads', err);
      } finally {
        setLoading(false);
      }
    };

    if (!user?.uid || (!groupId && brandCodes.length === 0)) {
      setAds([]);
      setReviewAds([]);
      setLoading(false);
      return;
    }

    fetchAds();
  }, [user, brandCodes, groupId]);

  const currentAd = reviewAds[currentIndex];
  const adUrl =
    currentAd && typeof currentAd === 'object'
      ? currentAd.adUrl || currentAd.firebaseUrl
      : currentAd;
  const brandCode =
    currentAd && typeof currentAd === 'object' ? currentAd.brandCode : undefined;
  const groupName =
    currentAd && typeof currentAd === 'object' ? currentAd.groupName : undefined;
  const selectedResponse = responses[adUrl]?.response;

  const submitResponse = async (responseType) => {
    if (!currentAd) return;
    setSubmitting(true);
    const respObj = {
      adUrl,
      response: responseType,
      comment: responseType === 'edit' ? comment : '',
      pass: responses[adUrl] ? 'revisit' : 'initial',
      ...(brandCode ? { brandCode } : {}),
      ...(groupName ? { groupName } : {}),
    };
    try {
      await addDoc(collection(db, 'responses'), {
        ...respObj,
        timestamp: serverTimestamp(),
      });
      if (currentAd.assetId && currentAd.adGroupId) {
        const assetRef = doc(
          db,
          'adGroups',
          currentAd.adGroupId,
          'assets',
          currentAd.assetId
        );
        const newStatus =
          responseType === 'approve'
            ? 'approved'
            : responseType === 'reject'
            ? 'rejected'
            : 'edit_requested';

        const updateData = {
          status: newStatus,
          comment: responseType === 'edit' ? comment : '',
          lastUpdatedBy: user.uid,
          lastUpdatedAt: serverTimestamp(),
          history: arrayUnion({
            userId: user.uid,
            action: newStatus,
            timestamp: Timestamp.now(),
          }),
          ...(responseType === 'approve' ? { isResolved: true } : {}),
          ...(responseType === 'edit' ? { isResolved: false } : {}),
        };

        await updateDoc(assetRef, updateData);

        if (responseType === 'edit') {
          await addDoc(collection(db, 'adGroups', currentAd.adGroupId, 'assets'), {
            adGroupId: currentAd.adGroupId,
            filename: currentAd.filename || '',
            firebaseUrl: '',
            uploadedAt: null,
            status: 'pending',
            comment: null,
            lastUpdatedBy: null,
            lastUpdatedAt: serverTimestamp(),
            history: [],
            version: (currentAd.version || 1) + 1,
            parentAdId: currentAd.assetId,
            isResolved: false,
          });
        } else if (responseType === 'approve' && currentAd.parentAdId) {
          await updateDoc(
            doc(
              db,
              'adGroups',
              currentAd.adGroupId,
              'assets',
              currentAd.parentAdId
            ),
            { isResolved: true }
          );
        }
      }
      setResponses((prev) => ({ ...prev, [adUrl]: respObj }));
      setComment('');
      setShowComment(false);
      setCurrentIndex((i) => i + 1);
      if (responseType === 'reject') {
        const newStreak = rejectionStreak + 1;
        setRejectionStreak(newStreak);
        if (newStreak >= 5) {
          setShowStreakModal(true);
        }
      } else {
        setRejectionStreak(0);
      }
    } catch (err) {
      console.error('Failed to submit response', err);
    } finally {
      setSubmitting(false);
    }
  };

  const submitNote = async () => {
    if (!currentAd?.adGroupId) {
      setShowClientNote(false);
      setClientNote('');
      return;
    }
    setNoteSubmitting(true);
    try {
      await updateDoc(doc(db, 'adGroups', currentAd.adGroupId), {
        clientNote: clientNote.trim(),
        clientNoteTimestamp: serverTimestamp(),
        hasClientNote: true,
      });
    } catch (err) {
      console.error('Failed to submit note', err);
    } finally {
      setNoteSubmitting(false);
      setClientNote('');
      setShowClientNote(false);
    }
  };

  if (loading) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  if (!ads || ads.length === 0) {
    return <div>No ads assigned to your account.</div>;
  }

  if (currentIndex >= reviewAds.length) {
    const allResponses = Object.values(responses);
    const approvedCount = allResponses.filter((r) => r.response === 'approve').length;
    const rejectedAds = ads.filter((a) => {
      const url = a.adUrl || a.firebaseUrl;
      return responses[url]?.response === 'reject';
    });
    const groupSummary = allResponses.reduce((acc, r) => {
      if (!r.groupName) return acc;
      acc[r.groupName] = (acc[r.groupName] || 0) + 1;
      return acc;
    }, {});

    const handleReviewRejected = () => {
      setReviewAds(rejectedAds);
      setCurrentIndex(0);
    };

    const handleReviewAll = () => {
      setReviewAds(ads);
      setCurrentIndex(0);
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <h2 className="text-2xl">Thank you for your feedback!</h2>
        <p>You approved {approvedCount}/{ads.length} ads.</p>
        {Object.keys(groupSummary).length > 0 && (
          <table className="min-w-full text-sm mt-2">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-1 text-left">Group</th>
                <th className="px-2 py-1 text-left">Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupSummary).map(([g, c]) => (
                <tr key={g} className="border-b">
                  <td className="px-2 py-1">{g}</td>
                  <td className="px-2 py-1 text-center">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rejectedAds.length > 0 && (
          <button
            onClick={handleReviewRejected}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            See Rejected Ads
          </button>
        )}
        <button
          onClick={handleReviewAll}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          See All
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      {showStreakModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm">
            <p className="mb-4">Oops, 5 in a row! Drop a note and we’ll regroup?</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowStreakModal(false);
                  setShowClientNote(true);
                  setRejectionStreak(0);
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                Drop a note and pause
              </button>
              <button
                onClick={() => {
                  setShowStreakModal(false);
                  setRejectionStreak(0);
                }}
                className="px-3 py-1 bg-gray-400 text-white rounded"
              >
                Keep reviewing
              </button>
            </div>
          </div>
        </div>
      )}
      <img
        src={adUrl}
        alt="Ad"
        className="max-w-full max-h-[80vh] mx-auto rounded shadow"
      />
      <div className="space-x-2">
        <button
          onClick={() => submitResponse('approve')}
          className={`px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ${selectedResponse && selectedResponse !== 'approve' ? 'opacity-50' : ''}`}
          disabled={submitting}
        >
          Approve
        </button>
        <button
          onClick={() => submitResponse('reject')}
          className={`px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${selectedResponse && selectedResponse !== 'reject' ? 'opacity-50' : ''}`}
          disabled={submitting}
        >
          Reject
        </button>
        <button
          onClick={() => setShowComment(true)}
          className={`px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 ${selectedResponse && selectedResponse !== 'edit' ? 'opacity-50' : ''}`}
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
      {showClientNote && (
        <div className="flex flex-col items-center space-y-2 w-full max-w-sm">
          <textarea
            value={clientNote}
            onChange={(e) => setClientNote(e.target.value)}
            className="w-full p-2 border rounded"
            rows={3}
            placeholder="Leave a note for the designer..."
          />
          <div className="space-x-2">
            <button
              onClick={submitNote}
              disabled={noteSubmitting}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              Submit Note
            </button>
            <button
              onClick={() => {
                setShowClientNote(false);
                setClientNote('');
              }}
              className="px-4 py-2 bg-gray-300 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Review;
