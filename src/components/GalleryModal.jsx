import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import VideoPlayer from './VideoPlayer.jsx';
import isVideoUrl from '../utils/isVideoUrl';

const GalleryModal = ({ ads = [], onClose }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 overflow-auto">
    <div className="bg-white p-4 rounded shadow max-w-6xl w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
      <div className="flex flex-wrap justify-center gap-2">
        {ads.map((a, idx) =>
          isVideoUrl(a.firebaseUrl) ? (
            <VideoPlayer key={idx} src={a.firebaseUrl} className="max-w-[125px] w-full h-auto object-contain" />
          ) : (
            <OptimizedImage
              key={idx}
              pngUrl={a.firebaseUrl}
              webpUrl={a.firebaseUrl.replace(/\.png$/, '.webp')}
              alt={a.filename}
              cacheKey={a.firebaseUrl}
              className="max-w-[125px] w-full h-auto object-contain"
            />
          )
        )}
      </div>
      <div className="text-right mt-4">
        <button onClick={onClose} className="btn-secondary px-3 py-1">
          Close
        </button>
      </div>
    </div>
  </div>
);

export default GalleryModal;
