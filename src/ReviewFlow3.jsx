import React, { useState } from 'react';
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

const ReviewFlow3 = ({ groups = [] }) => {
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

  const handleStatus = (key, value) => {
    if (value === 'edit requested') {
      const group = groups.find((g) => (g.recipeCode || g.id) === key) || {};
      const copy = group.latestCopy || group.copy || '';
      setComment(editRequests[key]?.comment || '');
      setEditCopy(editRequests[key]?.editCopy || copy);
      setOrigCopy(copy);
      setPrevStatus(statuses[key]);
      setCurrentKey(key);
      setStatuses((prev) => ({ ...prev, [key]: value }));
      setShowEditModal(true);
      return;
    }
    setStatuses((prev) => ({ ...prev, [key]: value }));
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
    setEditRequests((prev) => ({
      ...prev,
      [currentKey]: { comment, editCopy },
    }));
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
        const editRequest = editRequests[key]?.comment || group.editRequest;
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
              {editRequest && (
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
            {open[key] && editRequest && (
              <div className="mt-2 p-2 border-t text-sm">
                {editRequest}
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
        onClick={approveAll}
      >
        Approve All
      </Button>
    </div>
  );
};

export default ReviewFlow3;

