export default function parseAdFilename(filename) {
  if (!filename) return {};
  const name = filename.replace(/\.[^/.]+$/, '');
  const parts = name.split('_');

  const brandCode = parts[0] || '';
  const adGroupCode = parts[1] || '';
  const recipeCode = parts[2] || '';

  let aspectRatio = '';
  let version;

  if (parts.length >= 5) {
    aspectRatio = parts[3] || '';
    const match = /^V(\d+)/i.exec(parts[4]);
    if (match) version = parseInt(match[1], 10);
  } else if (parts.length === 4) {
    const match = /^V(\d+)/i.exec(parts[3]);
    if (match) {
      version = parseInt(match[1], 10);
    } else {
      aspectRatio = parts[3] || '';
    }
  }

  return { brandCode, adGroupCode, recipeCode, aspectRatio, version };
}
