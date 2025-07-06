import React, { useState } from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import VideoPlayer from './VideoPlayer.jsx';
import isVideoUrl from '../utils/isVideoUrl';

const AdThumb = ({ ad }) => {
  const [loading, setLoading] = useState(true);
  const onLoad = () => setLoading(false);
  return (
    <div className="relative flex-shrink-0 flex items-center justify-center w-[125px] h-[125px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="loading-ring w-6 h-6" />
        </div>
      )}
      {isVideoUrl(ad.firebaseUrl) ? (
        <VideoPlayer
          src={ad.firebaseUrl}
          className="max-w-[125px] w-full h-auto object-contain"
          onLoadedData={onLoad}
        />
      ) : (
        <OptimizedImage
          pngUrl={ad.firebaseUrl}
          webpUrl={ad.firebaseUrl.replace(/\.png$/, '.webp')}
          alt={ad.filename}
          cacheKey={ad.firebaseUrl}
          className="max-w-[125px] w-full h-auto object-contain"
          onLoad={onLoad}
        />
      )}
    </div>
  );
};

const GalleryModal = ({ ads = [], onClose }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
    <div className="bg-white p-4 rounded shadow max-w-6xl w-full max-h-[90vh] flex flex-col dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Ad Gallery</h2>
        <button onClick={onClose} className="btn-secondary px-3 py-1">Close</button>
      </div>
      <div className="overflow-auto flex-1">
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-4">
          {ads.map((a, idx) => (
            <AdThumb key={idx} ad={a} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default GalleryModal;
