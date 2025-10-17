export default function getPrimaryLogoUrl(logos = []) {
  if (!Array.isArray(logos)) {
    return typeof logos === 'string' ? logos : '';
  }
  for (const entry of logos) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      if (entry.trim()) return entry;
    } else if (entry.url) {
      return entry.url;
    }
  }
  return '';
}
