import parseAdFilename from './parseAdFilename';

export default function pickHeroAsset(list = []) {
  if (!list || list.length === 0) return null;
  const prefOrder = ['', '9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
  const getAspect = (a) => a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';
  const getVersion = (a) => a.version || parseAdFilename(a.filename || '').version || 1;
  const ordered = [...list].sort((a, b) => getVersion(b) - getVersion(a));
  for (const asp of prefOrder) {
    const found = ordered.find((a) => getAspect(a) === asp);
    if (found) return found;
  }
  return ordered[0];
}
