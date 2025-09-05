const sanitizeSrc = (url) => {
  if (!url) return null;
  if (/^data:/i.test(url)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Blocked data URI', url);
    }
    return null;
  }
  // Firebase Storage URLs require an "alt=media" query parameter to serve
  // the raw file contents. Some 1x1 assets were missing this flag and
  // returned a JSON permission error instead of the image. Append the
  // parameter when it's absent to avoid 403 responses.
  if (
    /^https?:\/\/firebasestorage\.googleapis\.com\//.test(url) &&
    !/[?&]alt=media/.test(url)
  ) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}alt=media`;
  }
  return url;
};

export default sanitizeSrc;
