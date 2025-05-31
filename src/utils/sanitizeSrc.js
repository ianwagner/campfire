const sanitizeSrc = (url) => {
  if (!url) return null;
  if (/^data:/i.test(url)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Blocked data URI', url);
    }
    return null;
  }
  return url;
};

export default sanitizeSrc;
