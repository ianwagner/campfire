export default function parseAdFilename(filename) {
  if (!filename) return {};
  const name = filename.replace(/\.[^/.]+$/, '');
  const parts = name.split('_');

  const brandCode = parts[0] || '';
  const adGroupCode = parts[1] || '';
  const recipeCode = parts[2] || '';

  let aspectRatio = '';
  let version;
  let carouselPage;

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

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const prevPart = parts[parts.length - 2] || '';
    if (/^[A-Z]$/i.test(lastPart) && /^V\d+$/i.test(prevPart)) {
      carouselPage = lastPart.toUpperCase();
    }
  }

  return { brandCode, adGroupCode, recipeCode, aspectRatio, version, carouselPage };
}
