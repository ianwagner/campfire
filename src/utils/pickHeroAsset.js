import parseAdFilename from './parseAdFilename';

export default function pickHeroAsset(list = []) {
  if (!list || list.length === 0) return null;
  const prefOrder = ['', '9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
  const getAspect = (a) => a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';
  for (const asp of prefOrder) {
    const found = list.find((a) => getAspect(a) === asp);
    if (found) return found;
  }
  return list[0];
}
