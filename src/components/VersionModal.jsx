import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import VideoPlayer from './VideoPlayer.jsx';
import isVideoUrl from '../utils/isVideoUrl';
import Button from './Button.jsx';

const VersionModal = ({ data, view = 'current', onViewChange, onClose }) => {
  if (!data) return null;
  const url =
    view === 'previous'
      ? data.previous.adUrl || data.previous.firebaseUrl
      : data.current.adUrl || data.current.firebaseUrl;
  const webpUrl = url?.replace(/\.png$/, '.webp');
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded-xl shadow max-w-md text-center">
          <div className="mb-2 space-x-2">
            <Button
              onClick={() => onViewChange('current')}
              variant={view === 'current' ? 'primary' : 'secondary'}
              className="px-2 py-1"
            >
              V{data.current.version || 1}
            </Button>
            <Button
              onClick={() => onViewChange('previous')}
              variant={view === 'previous' ? 'primary' : 'secondary'}
              className="px-2 py-1"
            >
              V{data.previous.version || 1} (replaced)
            </Button>
          </div>
        {isVideoUrl(url) ? (
          <VideoPlayer src={url} className="max-w-full max-h-[70vh] mx-auto" />
        ) : (
          <OptimizedImage
            pngUrl={url}
            webpUrl={webpUrl}
            alt="Ad version"
            cacheKey={url}
            className="max-w-full max-h-[70vh] mx-auto"
          />
        )}
        <Button onClick={onClose} variant="primary" className="mt-2 px-3 py-1">
          Close
        </Button>
      </div>
    </div>
  );
};

export default VersionModal;
