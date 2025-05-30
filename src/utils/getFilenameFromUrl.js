export default function getFilenameFromUrl(url) {
  if (!url) return '';
  try {
    const withoutQuery = url.split('?')[0];
    const segments = withoutQuery.split('/');
    return decodeURIComponent(segments[segments.length - 1]);
  } catch (_) {
    return '';
  }
}
