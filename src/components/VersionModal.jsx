import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import VideoPlayer from './VideoPlayer.jsx';
import isVideoUrl from '../utils/isVideoUrl';

const VersionModal = ({ data, view = 'current', onViewChange, onClose }) => {
  if (!data) return null;
  const url = view === 'previous' ? data.previous.firebaseUrl : data.current.firebaseUrl;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-md text-center">
        <div className="mb-2 space-x-2">
          <button onClick={() => onViewChange('current')} className="btn-secondary px-2 py-1">
            V{data.current.version || 1}
          </button>
          <button onClick={() => onViewChange('previous')} className="btn-secondary px-2 py-1">
            V{data.previous.version || 1} (replaced)
          </button>
        </div>
        {isVideoUrl(url) ? (
          <VideoPlayer src={url} className="max-w-full max-h-[70vh] mx-auto" />
        ) : (
          <OptimizedImage
            pngUrl={url}
            webpUrl={url.replace(/\.png$/, '.webp')}
            alt="Ad version"
            cacheKey={url}
            className="max-w-full max-h-[70vh] mx-auto"
          />
        )}
        <button onClick={onClose} className="mt-2 btn-primary px-3 py-1">
          Close
        </button>
      </div>
    </div>
  );
};

export default VersionModal;
