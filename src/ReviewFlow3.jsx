import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import EditRequestModal from './components/EditRequestModal.jsx';
import Button from './components/Button.jsx';
import Modal from './components/Modal.jsx';
import isVideoUrl from './utils/isVideoUrl';
import { db } from './firebase/config';

const STATUS_META = {
  pending: { label: 'Pending', color: 'bg-gray-400' },
  approved: { label: 'Approved', color: 'bg-green-500' },
  rejected: { label: 'Rejected', color: 'bg-red-500' },
  'edit requested': { label: 'Edit Requested', color: 'bg-yellow-500' },
};

const ReviewFlow3 = ({ groups = [], reviewerName = '' }) => {
  const initStatuses = () => {
    const map = {};
    groups.forEach((g) => {
      const key = g.recipeCode || g.id;
      map[key] = 'pending';
    });
    return map;
  };

  const [statuses, setStatuses] = useState(initStatuses);
  const [open, setOpen] = useState({});
  const [editRequests, setEditRequests] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentKey, setCurrentKey] = useState(null);
  const [prevStatus, setPrevStatus] = useState(null);
  const [comment, setComment] = useState('');
  const [editCopy, setEditCopy] = useState('');
  const [origCopy, setOrigCopy] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showCopyField, setShowCopyField] = useState(true);
  const [showCommentField, setShowCommentField] = useState(true);
  const [reviewFinalized, setReviewFinalized] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [stuck, setStuck] = useState(false);
  const barRef = useRef(null);

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0, 'edit requested': 0 };
    Object.values(statuses).forEach((s) => {
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [statuses]);

  const groupTitle =
    groups[0]?.name || groups[0]?.assets?.[0]?.groupName || '';

  useEffect(() => {
    const handleScroll = () => {
      if (!barRef.current) return;
      const { top } = barRef.current.getBoundingClientRect();
      setStuck(top <= 0);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openEditModal = async (
    key,
    { showCopy = true, showComment = true } = {},
  ) => {
    const group = groups.find((g) => (g.recipeCode || g.id) === key) || {};
    let copy =
      group.assets?.[0]?.meta?.copy ||
      group.latestCopy ||
      group.copy ||
      group.assets?.[0]?.copy ||
      '';
    if (showCopy) {
      try {
        const adGroupId = group.assets?.[0]?.adGroupId;
        const recipeId = group.recipeCode || group.id;
        if (adGroupId && recipeId) {
          const snap = await getDoc(
            doc(db, 'adGroups', adGroupId, 'recipes', recipeId),
          );
          const data = snap.exists() ? snap.data() : null;
          copy = data ? data.latestCopy || data.copy || copy : copy;
        }
      } catch (err) {
        console.error('Failed to load copy', err);
      }
    }
    const prev = editRequests[key];
    setComment('');
    setEditCopy(prev?.editCopy || copy);
    setOrigCopy(copy);
    setPrevStatus(statuses[key]);
    setCurrentKey(key);
    setShowCopyField(showCopy);
    setShowCommentField(showComment);
    setShowEditModal(true);
  };

  const handleStatus = (key, value) => {
    if (value === 'edit requested') {
      setStatuses((prev) => ({ ...prev, [key]: value }));
      openEditModal(key, { showCopy: true, showComment: true });
      return;
    }
    setStatuses((prev) => ({ ...prev, [key]: value }));
  };

  const approvePending = () => {
    let nextStatuses = {};
    setStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === 'pending') next[k] = 'approved';
      });
      nextStatuses = next;
      return next;
    });
    return nextStatuses;
  };

  const approveAll = () => {
    setStatuses((prev) => {
      const next = {};
      Object.keys(prev).forEach((k) => {
        next[k] = 'approved';
      });
      return next;
    });
  };

  const handleApproveClick = () => {
    const hasEditsOrRejections = Object.values(statuses).some((s) =>
      ['rejected', 'edit requested'].includes(s),
    );
    if (hasEditsOrRejections) {
      setShowApproveModal(true);
    } else {
      approvePending();
    }
  };

  const cancelEdit = () => {
    if (currentKey !== null) {
      setStatuses((prev) => ({ ...prev, [currentKey]: prevStatus }));
    }
    setShowEditModal(false);
    setCurrentKey(null);
    setPrevStatus(null);
    setComment('');
    setEditCopy('');
    setOrigCopy('');
    setShowCopyField(true);
    setShowCommentField(true);
  };

  const submitEdit = () => {
    if (currentKey === null) return;
    setEditRequests((prev) => {
      const existing = prev[currentKey] || { comments: [], editCopy };
      const nextEditCopy = showCopyField ? editCopy : existing.editCopy;
      const comments = comment.trim()
        ? [...(existing.comments || []), { author: reviewerName, text: comment.trim() }]
        : existing.comments || [];
      return {
        ...prev,
        [currentKey]: { editCopy: nextEditCopy, comments },
      };
    });
    setShowEditModal(false);
    setCurrentKey(null);
    setPrevStatus(null);
    setComment('');
    setEditCopy('');
    setOrigCopy('');
    setShowCopyField(true);
    setShowCommentField(true);
  };

  const finalizeReview = async (overrideStatuses) => {
    const statusMap = overrideStatuses || statuses;
    try {
      const updates = groups.map(async (group) => {
        const key = group.recipeCode || group.id;
        const assets = group.assets || [];
        const adGroupId = assets[0]?.adGroupId;
        if (!adGroupId) return;
        const ref = doc(db, 'adGroups', adGroupId, 'recipes', key);
        const version = Math.max(
          1,
          ...assets.map((a) => {
            const match = /_V(\d+)/i.exec(a.filename || '');
            return match ? parseInt(match[1], 10) : 1;
          })
        );
        const type = assets.some((a) =>
          isVideoUrl(a.filename || a.firebaseUrl)
        )
          ? 'motion'
          : 'still';
        const editReq = editRequests[key];
        const updateObj = {
          status: statusMap[key],
          version,
          type,
          ...(editReq
            ? {
                editHistory: arrayUnion({
                  editCopy: editReq.editCopy,
                  comments: editReq.comments || [],
                  reviewer: reviewerName,
                  timestamp: serverTimestamp(),
                }),
              }
            : {}),
        };
        await updateDoc(ref, updateObj);
      });
      await Promise.all(updates);
    } catch (err) {
      console.error('Failed to finalize review', err);
    }
    setReviewFinalized(true);
  };

  const handleFinalizeClick = async () => {
    const hasPending = Object.values(statuses).some((s) => s === 'pending');
    if (hasPending) {
      setShowFinalizeModal(true);
    } else {
      await finalizeReview();
    }
  };

  return (
    <div className="space-y-4 mt-4 w-full">
      <div ref={barRef} className="sticky top-0 z-30 w-full flex justify-center">
        <div
          className={`mt-2 min-w-[340px] max-w-full rounded-lg border border-gray-300 bg-white px-4 py-2 shadow flex items-center gap-4 transition-opacity duration-300 dark:bg-[var(--dark-sidebar-bg)] dark:border-gray-600 dark:text-[var(--dark-text)] ${stuck ? 'opacity-60 hover:opacity-100' : ''}`}
        >
          <div>
            <div className="font-semibold truncate max-w-[200px]" title={groupTitle}>
              {groupTitle}
            </div>
            <div className="text-xs">
              {reviewFinalized ? 'Review Finalized' : 'Review in Progress'}
            </div>
          </div>
          <div className="flex gap-4 ml-4">
            {Object.keys(STATUS_META).map((key) => (
              <div key={key} className="text-center">
                <div className="text-lg font-semibold">{statusCounts[key] || 0}</div>
                <div className="text-xs">{STATUS_META[key].label}</div>
              </div>
            ))}
          </div>
          {!reviewFinalized && (
            <>
              <div className="h-6 border-l ml-4" />
              <Button onClick={handleFinalizeClick} className="text-sm" variant="secondary">
                Finalize Review
              </Button>
            </>
          )}
        </div>
      </div>
      {groups.map((group) => {
        const key = group.recipeCode || group.id;
        const status = statuses[key];
        const editRequest = editRequests[key];
        const comments = [
          ...(group.editRequest
            ? [{ author: group.editRequestBy || '', text: group.editRequest }]
            : []),
          ...(editRequest?.comments || []),
        ];
        return (
          <div key={key} className="border rounded p-4">
            <div className="flex flex-wrap justify-center gap-4">
              {(group.assets || []).map((a, idx) => (
                <div key={idx} className="max-w-[300px]">
                  {isVideoUrl(a.firebaseUrl) ? (
                    <VideoPlayer
                      src={a.firebaseUrl}
                      className="max-w-full rounded shadow"
                      style={{
                        aspectRatio:
                          String(a.aspectRatio || '').replace('x', '/') || undefined,
                      }}
                    />
                  ) : (
                    <OptimizedImage
                      pngUrl={a.firebaseUrl}
                      webpUrl={a.firebaseUrl?.replace(/\.png$/, '.webp')}
                      alt={a.filename}
                      cacheKey={a.firebaseUrl}
                      className="max-w-full rounded shadow"
                      style={{
                        aspectRatio:
                          String(a.aspectRatio || '').replace('x', '/') || undefined,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center space-x-1">
                <span className={`w-2 h-2 rounded-full ${STATUS_META[status].color}`}></span>
                <select
                  value={status}
                  onChange={(e) => handleStatus(key, e.target.value)}
                  className="border rounded p-1 text-sm"
                >
                  {Object.entries(STATUS_META).map(([val, meta]) => (
                    <option key={val} value={val}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
              {(comments.length > 0 || editRequest?.editCopy) && (
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() =>
                    setOpen((p) => ({ ...p, [key]: !p[key] }))
                  }
                >
                  {open[key] ? 'Hide Edit Request' : 'View Edit Request'}
                </button>
              )}
            </div>
            {open[key] && (comments.length > 0 || editRequest?.editCopy) && (
              <div className="mt-2 p-2 border-t text-sm space-y-1">
                {comments.map((c, idx) => (
                  <div key={idx}>
                    <span className="font-medium">{c.author}:</span> {c.text}
                  </div>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs underline mt-2"
                  onClick={() =>
                    openEditModal(key, { showCopy: false, showComment: true })
                  }
                >
                  <FiPlus /> add comment
                </button>
                {editRequest?.editCopy && (
                  <div className="mt-2 p-2 border rounded bg-gray-50">
                    <p className="text-xs font-medium mb-1">Requested copy</p>
                    <p className="whitespace-pre-wrap break-words">
                      {editRequest.editCopy}
                    </p>
                    <button
                      type="button"
                      className="text-xs underline mt-2"
                      onClick={() =>
                        openEditModal(key, { showCopy: true, showComment: false })
                      }
                    >
                      edit copy
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {showEditModal && (
        <EditRequestModal
          comment={comment}
          onCommentChange={setComment}
          editCopy={editCopy}
          onEditCopyChange={setEditCopy}
          origCopy={origCopy}
          showCopyField={showCopyField}
          showCommentField={showCommentField}
          canSubmit={
            (showCommentField && comment.trim().length > 0) ||
            (showCopyField && editCopy.trim() && editCopy.trim() !== origCopy.trim())
          }
          onCancel={cancelEdit}
          onSubmit={submitEdit}
          submitting={false}
        />
      )}
      <button
        type="button"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 text-sm border border-gray-300 rounded bg-white shadow dark:bg-[var(--dark-sidebar-bg)] dark:border-gray-600 dark:text-[var(--dark-text)]"
        onClick={handleApproveClick}
      >
        Approve all
      </button>
      {showApproveModal && (
        <Modal className="space-y-4">
          <h2 className="text-lg font-semibold">Approve all ads</h2>
          <p>
            Some ads already have edit requests or rejections. Would you like to leave those as they are, or mark every ad as approved?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                approvePending();
                setShowApproveModal(false);
              }}
              className="px-3 py-1"
            >
              Approve pending ads
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                approveAll();
                setShowApproveModal(false);
              }}
              className="px-3 py-1"
            >
              Approve all ads
            </Button>
          </div>
        </Modal>
      )}
      {showFinalizeModal && (
        <Modal className="space-y-4">
          <h2 className="text-lg font-semibold">Finalize Review</h2>
          <p>Some ads are still pending. Would you like to mark them as approved?</p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowFinalizeModal(false)}
              className="px-3 py-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const updated = approvePending();
                await finalizeReview(updated);
                setShowFinalizeModal(false);
              }}
              className="px-3 py-1"
            >
              Approve pending ads
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ReviewFlow3;

