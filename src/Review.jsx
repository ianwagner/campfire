// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useState, useEffect } from 'react';
import {
  collection,
  collectionGroup,
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
  increment,
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
  const [editing, setEditing] = useState(false);
  const reviewedKey = groupId ? `reviewComplete-${groupId}` : null;
  const [secondPass, setSecondPass] = useState(
    reviewedKey ? localStorage.getItem(reviewedKey) === 'true' : false
  );
  const [showHistory, setShowHistory] = useState(false);
  const [animating, setAnimating] = useState(null); // 'approve' | 'reject'

  useEffect(() => {
    setEditing(false);
  }, [currentIndex]);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        let list = [];
        if (groupId) {
          const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
          if (groupSnap.exists()) {
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', groupId, 'assets')
            );
            list = assetsSnap.docs
              .map((assetDoc) => ({
                ...assetDoc.data(),
                assetId: assetDoc.id,
                adGroupId: groupId,
                groupName: groupSnap.data().name,
                firebaseUrl: assetDoc.data().firebaseUrl,
                ...(groupSnap.data().brandCode
                  ? { brandCode: groupSnap.data().brandCode }
                  : {}),
              }))
              .filter((a) => a.status !== 'pending');
          }
        } else {
          const q = query(
            collectionGroup(db, 'assets'),
            where('brandCode', 'in', brandCodes),
            where('status', '==', 'ready'),
            where('isResolved', '==', false)
          );
          const snap = await getDocs(q);
          const groupCache = {};
          list = await Promise.all(
            snap.docs.map(async (d) => {
              const data = d.data();
              const adGroupId = data.adGroupId || d.ref.parent.parent.id;
              if (!groupCache[adGroupId]) {
                const gSnap = await getDoc(doc(db, 'adGroups', adGroupId));
                groupCache[adGroupId] = gSnap.exists() ? gSnap.data().name : '';
              }
              return {
                ...data,
                assetId: d.id,
                adGroupId,
                groupName: groupCache[adGroupId],
                firebaseUrl: data.firebaseUrl,
              };
            })
          );
        }

        setAds(list);

        const key = groupId ? `lastViewed-${groupId}` : null;
        const stored = key ? localStorage.getItem(key) : null;
        const lastLogin = stored
          ? new Date(stored)
          : user?.metadata?.lastSignInTime
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
  const showSecondView = secondPass && selectedResponse && !editing;
  const progress =
    reviewAds.length > 0 ? (currentIndex / reviewAds.length) * 100 : 0;
  const statusMap = {
    approve: 'Approved',
    reject: 'Rejected',
    edit: 'Edit Requested',
  };
  const colorMap = {
    approve: 'text-green-700',
    reject: 'text-gray-700',
    edit: 'text-black',
  };

  useEffect(() => {
    const next = reviewAds[currentIndex + 1];
    if (next) {
      const img = new Image();
      img.src = next.adUrl || next.firebaseUrl;
    }
  }, [currentIndex, reviewAds]);

  const submitResponse = async (responseType) => {
    if (!currentAd) return;
    setAnimating(responseType);
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
            userEmail: user.email,
            action: newStatus,
            comment: responseType === 'edit' ? comment : '',
            timestamp: Timestamp.now(),
          }),
          ...(responseType === 'approve' ? { isResolved: true } : {}),
          ...(responseType === 'edit' ? { isResolved: false } : {}),
        };

        await updateDoc(assetRef, updateData);

        const prevStatus = currentAd.status;
        const newState = newStatus;
        let incReviewed = 0;
        let incApproved = 0;
        let incRejected = 0;
        let incEdit = 0;
        if (prevStatus === 'ready') {
          incReviewed += 1;
        }
        if (prevStatus !== newState) {
          if (prevStatus === 'approved') incApproved -= 1;
          if (prevStatus === 'rejected') incRejected -= 1;
          if (prevStatus === 'edit_requested') incEdit -= 1;
          if (newState === 'approved') incApproved += 1;
          if (newState === 'rejected') incRejected += 1;
          if (newState === 'edit_requested') incEdit += 1;
        }

        const groupRef = doc(db, 'adGroups', currentAd.adGroupId);
        const gSnap = await getDoc(groupRef);
        const updateObj = {
          ...(incReviewed ? { reviewedCount: increment(incReviewed) } : {}),
          ...(incApproved ? { approvedCount: increment(incApproved) } : {}),
          ...(incRejected ? { rejectedCount: increment(incRejected) } : {}),
          ...(incEdit ? { editCount: increment(incEdit) } : {}),
          lastUpdated: serverTimestamp(),
          ...(gSnap.exists() && !gSnap.data().thumbnailUrl
            ? { thumbnailUrl: currentAd.firebaseUrl }
            : {}),
        };
        await updateDoc(groupRef, updateObj);

        if (responseType === 'edit') {
          await addDoc(collection(db, 'adGroups', currentAd.adGroupId, 'assets'), {
            adGroupId: currentAd.adGroupId,
            brandCode: currentAd.brandCode || '',
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
          const relatedQuery = query(
            collection(db, 'adGroups', currentAd.adGroupId, 'assets'),
            where('parentAdId', '==', currentAd.parentAdId)
          );
          const relatedSnap = await getDocs(relatedQuery);
          await Promise.all(
            relatedSnap.docs.map((d) =>
              updateDoc(
                doc(db, 'adGroups', currentAd.adGroupId, 'assets', d.id),
                { isResolved: true }
              )
            )
          );
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
      if (groupId) {
        localStorage.setItem(`lastViewed-${groupId}`, new Date().toISOString());
        if (!secondPass) {
          localStorage.setItem(`reviewComplete-${groupId}`, 'false');
        }
      }
      setResponses((prev) => ({ ...prev, [adUrl]: respObj }));
      setComment('');
      setShowComment(false);
      setTimeout(() => {
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
        setAnimating(null);
      }, 400);
    } catch (err) {
      console.error('Failed to submit response', err);
    } finally {
      setSubmitting(false);
      setEditing(false);
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
    if (groupId) {
      localStorage.setItem(
        `lastViewed-${groupId}`,
        new Date().toISOString()
      );
      localStorage.setItem(`reviewComplete-${groupId}`, 'true');
    }
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
            className="btn-primary"
          >
            See Rejected Ads
          </button>
        )}
        <button
          onClick={handleReviewAll}
          className="btn-secondary"
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
                className="btn-primary px-3 py-1"
              >
                Drop a note and pause
              </button>
              <button
                onClick={() => {
                  setShowStreakModal(false);
                  setRejectionStreak(0);
                }}
                className="btn-secondary px-3 py-1 text-white"
              >
                Keep reviewing
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="relative flex flex-col items-center w-fit mx-auto">
        {!secondPass && (
          <div
            className="w-full max-w-md h-4 bg-gray-200 rounded-full shadow-inner mb-2.5"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              className="h-full bg-green-500 transition-all rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="relative">
          <img
            src={adUrl}
            alt="Ad"
            loading="lazy"
            className={`max-w-[90%] max-h-[72vh] mx-auto rounded shadow ${
              animating === 'reject' ? 'reject-fade' : ''
            } ${animating === 'approve' ? 'approve-glow' : ''}`}
          />
          {animating === 'approve' && (
            <div className="approve-check">✓</div>
          )}
        </div>
        {secondPass && (
          <div className="absolute left-full ml-4 top-0">
            <button
              onClick={() => setShowHistory((p) => !p)}
              className="flex items-center space-x-1 bg-white p-2 rounded shadow"
            >
              <span>{currentAd?.filename}</span>
              <span>{showHistory ? '▼' : '▶'}</span>
            </button>
            {showHistory && (
              <div className="mt-2 p-2 text-xs w-48">
                {Array.isArray(currentAd?.history) && currentAd.history.length > 0 ? (
                  [...currentAd.history]
                    .sort(
                      (a, b) =>
                        (a.timestamp?.toMillis?.() || 0) -
                        (b.timestamp?.toMillis?.() || 0)
                    )
                    .map((h, idx) => {
                      const colorMap = {
                        approved: 'text-green-600',
                        rejected: 'text-black',
                        edit_requested: 'text-orange-500',
                      };
                      const textMap = {
                        approved: 'Approved',
                        rejected: 'Rejected',
                        edit_requested: 'Edit Requested',
                      };
                      const cls = colorMap[h.action] || '';
                      return (
                        <div key={idx} className={`mb-1 ${cls}`}>
                          {h.timestamp?.toDate
                            ? h.timestamp.toDate().toLocaleString()
                            : ''}{' '}
                          - {textMap[h.action] || h.action} -{' '}
                          {h.userEmail || h.userId}
                          {h.comment ? `: ${h.comment}` : ''}
                        </div>
                      );
                    })
                ) : (
                  <div>No history</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showSecondView ? (
        <div className="flex items-center space-x-4">
          {currentIndex > 0 && (
            <button
              aria-label="Previous"
              onClick={() =>
                setCurrentIndex((i) => Math.max(0, i - 1))
              }
              className="btn-arrow"
            >
              &lt;
            </button>
          )}
          <div className="text-center space-y-2">
            <p className={`text-lg ${colorMap[selectedResponse]}`}>{statusMap[selectedResponse]}</p>
            {selectedResponse === 'edit' && currentAd.comment && (
              <p className="text-sm">{currentAd.comment}</p>
            )}
            <button
              onClick={() => setEditing(true)}
              className="btn-secondary"
            >
              Change
            </button>
          </div>
          {currentIndex < reviewAds.length - 1 && (
            <button
              aria-label="Next"
              onClick={() =>
                setCurrentIndex((i) => Math.min(reviewAds.length - 1, i + 1))
              }
              className="btn-arrow"
            >
              &gt;
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex space-x-4">
            <button
              onClick={() => submitResponse('reject')}
              className={`btn-reject ${selectedResponse && selectedResponse !== 'reject' ? 'opacity-50' : ''}`}
              disabled={submitting}
            >
              Reject
            </button>
            <button
              onClick={() => setShowComment(true)}
              className={`btn-edit ${selectedResponse && selectedResponse !== 'edit' ? 'opacity-50' : ''}`}
              disabled={submitting}
              aria-label="Request Edit"
            >
              ✏️
            </button>
            <button
              onClick={() => submitResponse('approve')}
              className={`btn-approve ${selectedResponse && selectedResponse !== 'approve' ? 'opacity-50' : ''}`}
              disabled={submitting}
            >
              Approve
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
                className="btn-primary"
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
              <div className="flex space-x-2">
                <button
                  onClick={submitNote}
                  disabled={noteSubmitting}
                  className="btn-primary"
                >
                  Submit Note
                </button>
                <button
                  onClick={() => {
                    setShowClientNote(false);
                    setClientNote('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Review;
