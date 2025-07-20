export default function normalizeAssetType(t) {
  if (!t) return '';
  const type = t.toString().trim().toLowerCase();
  if (!type) return '';
  const imageKeywords = ['still', 'image', 'static', 'img', 'picture', 'photo'];
  const videoKeywords = ['motion', 'video', 'animated', 'gif'];
  if (imageKeywords.some((k) => type.includes(k))) {
    return 'image';
  }
  if (videoKeywords.some((k) => type.includes(k))) {
    return 'video';
  }
  return type;
}
