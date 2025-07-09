export default function stripVersion(name = '') {
  const noExt = name.replace(/\.[^/.]+$/, '');
  return noExt.replace(/_V\d+$/i, '');
}
