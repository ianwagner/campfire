import React, { useState } from 'react';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import isVideoUrl from './utils/isVideoUrl';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-400' },
  { value: 'approved', label: 'Approved', color: 'bg-green-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500' },
  { value: 'edit_requested', label: 'Edit Requested', color: 'bg-yellow-500' },
];

const getUrl = (ad) => {
  if (!ad) return null;
  if (typeof ad === 'string') return ad;
  return ad.adUrl || ad.firebaseUrl;
};

const SimpleReview = ({ ads = [] }) => {
  const [statuses, setStatuses] = useState(ads.map(() => 'pending'));
  const [expanded, setExpanded] = useState({});

  const setStatus = (idx, value) => {
    setStatuses((prev) => {
      const copy = [...prev];
      copy[idx] = value;
      return copy;
    });
  };

  const toggleExpanded = (idx) => {
    setExpanded((p) => ({ ...p, [idx]: !p[idx] }));
  };

  if (ads.length === 0) {
    return <div className="p-4">No ads to review.</div>;
  }

  return (
    <div className="space-y-6">
      {ads.map((ad, idx) => {
        const url = getUrl(ad);
        const editRequest = ad.editRequest;
        const statusObj =
          STATUS_OPTIONS.find((o) => o.value === statuses[idx]) || STATUS_OPTIONS[0];
        return (
          <div key={idx} className="border rounded-lg p-4">
            {isVideoUrl(url) ? (
              <VideoPlayer src={url} className="max-h-[70vh] mx-auto" />
            ) : (
              <OptimizedImage
                pngUrl={url}
                webpUrl={url?.replace(/\.png$/, '.webp')}
                alt={`Ad ${idx + 1}`}
                className="mx-auto"
              />
            )}
            <div className="flex justify-between mt-2">
              <div className="relative inline-block">
                <select
                  className="pl-6 pr-2 py-1 border rounded text-sm"
                  value={statuses[idx]}
                  onChange={(e) => setStatus(idx, e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span
                  className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${statusObj.color}`}
                />
              </div>
              {editRequest && (
                <button
                  type="button"
                  className="text-sm text-blue-600"
                  onClick={() => toggleExpanded(idx)}
                >
                  {expanded[idx] ? 'Hide Edit Request' : 'View Edit Request'}
                </button>
              )}
            </div>
            {expanded[idx] && editRequest && (
              <div className="mt-2 p-2 border rounded bg-gray-50 text-sm">
                {editRequest}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SimpleReview;

