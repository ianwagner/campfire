import React, { useState } from 'react';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
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
      map[key] = g.status || 'pending';
    });
    return map;
  };

  const [statuses, setStatuses] = useState(() => initStatuses());
  const [open, setOpen] = useState({});

  const handleStatus = (key, value) => {
    setStatuses((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const key = group.recipeCode || group.id;
        const status = statuses[key] || 'pending';
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
              {group.editRequest && (
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
            {open[key] && group.editRequest && (
              <div className="mt-2 p-2 border-t text-sm">
                {group.editRequest}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReviewFlow3;

