import React from 'react';
import sanitizeSrc from '../utils/sanitizeSrc';

const isHosted = (url) => /^https?:\/\//i.test(url || '');

const VideoPlayer = ({ mp4Url, webmUrl, src, poster = '', ...props }) => {
  const mp4Src = sanitizeSrc(isHosted(mp4Url) ? mp4Url : mp4Url || src);
  const webmSrc = sanitizeSrc(isHosted(webmUrl) ? webmUrl : webmUrl);
  const posterSrc = sanitizeSrc(poster);

  const key = mp4Src || webmSrc || src || posterSrc;
  return (
    <video key={key} controls poster={posterSrc} {...props}>
      {webmSrc && <source src={webmSrc} type="video/webm" />}
      {mp4Src && <source src={mp4Src} type="video/mp4" />}
    </video>
  );
};

export default VideoPlayer;
