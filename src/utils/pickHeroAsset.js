import parseAdFilename from './parseAdFilename';
import getVersion from './getVersion';

const canonicalizeAspect = (value) => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (['1x1', '1:1', 'square'].includes(lowered)) return '1x1';
  if (['4x5', '4:5', 'portrait', '3x5', '3:5'].includes(lowered)) return '4x5';
  if (['9x16', '9:16', 'vertical', 'story', 'stories', 'reel', 'reels'].includes(lowered)) {
    return '9x16';
  }
  return raw;
};

export default function pickHeroAsset(list = []) {
  if (!list || list.length === 0) return null;
  const prefOrder = ['', '9x16', '4x5', '1x1', 'Pinterest', 'Snapchat'];
  const getAspect = (a) =>
    canonicalizeAspect(
      a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '',
    );
  const ordered = [...list].sort((a, b) => getVersion(b) - getVersion(a));
  for (const asp of prefOrder) {
    const normalizedTarget = canonicalizeAspect(asp);
    const found = ordered.find((a) => getAspect(a) === normalizedTarget);
    if (found) return found;
  }
  return ordered[0];
}
