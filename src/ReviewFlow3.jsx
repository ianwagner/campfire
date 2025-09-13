import React, { useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import EditRequestModal from './components/EditRequestModal.jsx';
import Button from './components/Button.jsx';
import isVideoUrl from './utils/isVideoUrl';

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

  const openEditModal = (key) => {
    const group = groups.find((g) => (g.recipeCode || g.id) === key) || {};
    const copy =
      group.latestCopy ||
      group.copy ||
      group.assets?.[0]?.copy ||
      group.assets?.[0]?.meta?.copy ||
      '';
    const prev = editRequests[key];
    setComment('');
    setEditCopy(prev?.editCopy || copy);
    setOrigCopy(copy);
    setPrevStatus(statuses[key]);
    setCurrentKey(key);
    setShowEditModal(true);
  };

  const handleStatus = (key, value) => {
    if (value === 'edit requested') {
      setStatuses((prev) => ({ ...prev, [key]: value }));
      openEditModal(key);
      return;
    }
    setStatuses((prev) => ({ ...prev, [key]: value }));
  };

  const approvePending = () => {
    setStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === 'pending') next[k] = 'approved';
      });
      return next;
    });
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
  };

  const submitEdit = () => {
    if (currentKey === null) return;
    setEditRequests((prev) => {
      const existing = prev[currentKey] || { comments: [], editCopy };
      const comments = comment.trim()
        ? [...(existing.comments || []), { author: reviewerName, text: comment.trim() }]
        : existing.comments || [];
      return {
        ...prev,
        [currentKey]: { editCopy, comments },
      };
    });
    setShowEditModal(false);
    setCurrentKey(null);
    setPrevStatus(null);
    setComment('');
    setEditCopy('');
    setOrigCopy('');
  };

  return (
    <div className="space-y-4">
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
              {comments.length > 0 && (
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
            {open[key] && comments.length > 0 && (
              <div className="mt-2 p-2 border-t text-sm space-y-1">
                {comments.map((c, idx) => (
                  <div key={idx}>
                    <span className="font-medium">{c.author}:</span> {c.text}
                  </div>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs underline mt-2"
                  onClick={() => openEditModal(key)}
                >
                  <FiPlus /> Add comment
                </button>
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
          canSubmit={
            comment.trim().length > 0 ||
            (editCopy.trim() && editCopy.trim() !== origCopy.trim())
          }
          onCancel={cancelEdit}
          onSubmit={submitEdit}
          submitting={false}
        />
      )}
      <Button
        variant="approve"
        className="fixed bottom-4 right-4 z-10"
        onClick={handleApproveClick}
      >
        Approve All
      </Button>
      {showApproveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded-xl shadow max-w-sm w-full space-y-4 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
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
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewFlow3;

