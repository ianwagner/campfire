import React, { useState, useEffect, useRef } from 'react';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import isVideoUrl from './utils/isVideoUrl';

const PRELOAD_AHEAD = 5;

const getUrl = (ad) => {
  if (!ad) return null;
  if (typeof ad === 'string') return ad;
  return ad.adUrl || ad.firebaseUrl;
};

const SimpleReview = ({ ads = [] }) => {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(false);
  const preloaded = useRef({});

  const currentUrl = getUrl(ads[index]);

  // Preload the next few ads ahead of time
  useEffect(() => {
    for (let i = index + 1; i <= index + PRELOAD_AHEAD && i < ads.length; i += 1) {
      const url = getUrl(ads[i]);
      if (url && !preloaded.current[url] && !isVideoUrl(url)) {
        const img = new Image();
        img.src = url; // no cache-busting params
        preloaded.current[url] = img;
      }
    }
    // Drop images behind the current index to free memory
    Object.keys(preloaded.current).forEach((u) => {
      const idx = ads.findIndex((a) => getUrl(a) === u);
      if (idx < index - 1) {
        delete preloaded.current[u];
      }
    });
  }, [index, ads]);

  const advance = (step) => {
    setFade(true);
    setTimeout(() => {
      setIndex((i) => Math.min(Math.max(i + step, 0), ads.length - 1));
      setFade(false);
    }, 400); // match --duration-fast
  };

  if (!currentUrl) {
    return <div className="p-4">No ads to review.</div>;
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className={`max-w-full ${fade ? 'simple-fade-out' : 'simple-fade-in'}`}>
        {isVideoUrl(currentUrl) ? (
          <VideoPlayer src={currentUrl} className="max-h-[70vh]" />
        ) : (
          <OptimizedImage
            pngUrl={currentUrl}
            webpUrl={currentUrl.replace(/\.png$/, '.webp')}
            alt="Ad"
            loading="eager"
          />
        )}
      </div>
      <div className="flex space-x-2">
        <button
          className="btn-secondary px-3 py-1"
          onClick={() => advance(-1)}
          disabled={index === 0}
        >
          Prev
        </button>
        <button
          className="btn-primary px-3 py-1"
          onClick={() => advance(1)}
          disabled={index >= ads.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default SimpleReview;
