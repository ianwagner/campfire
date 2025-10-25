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
    const prevPrevPart = parts[parts.length - 3] || '';
    const isPageSuffix = /^[A-Z]$/i.test(lastPart);
    const precedesVersion = /^V\d+$/i.test(prevPart);
    const precedesAspect = /^(?:\d+(?:\.\d+)?)x(?:\d+(?:\.\d+)?)$/i.test(prevPart);
    if (
      isPageSuffix &&
      (precedesVersion || precedesAspect || /^V\d+$/i.test(prevPrevPart))
    ) {
      carouselPage = lastPart.toUpperCase();
    }
  }

  return { brandCode, adGroupCode, recipeCode, aspectRatio, version, carouselPage };
}
