const sanitizeSrc = (url) => {
  if (!url) return null;
  if (/^data:/i.test(url)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Blocked data URI', url);
    }
    return null;
  }
  // Firebase-managed Storage URLs require an "alt=media" query parameter to
  // serve the raw file contents. Some assets created via the GCS console use
  // the `storage.googleapis.com` host instead of `firebasestorage`, and both
  // domains return the same JSON 403 envelope when the flag is missing. Append
  // the parameter when it's absent to avoid anonymous reviewers seeing
  // permission errors.
  if (
    /^https?:\/\/(?:firebasestorage|storage)\.googleapis\.com\//i.test(url) &&
    !/[?&]alt=media/i.test(url)
  ) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}alt=media`;
  }
  return url;
};

export default sanitizeSrc;
