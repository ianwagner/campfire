export default function parseAdFilename(filename) {
  if (!filename) return {};
  const name = filename.replace(/\.[^/.]+$/, '');
  const parts = name.split('_');
  if (parts.length < 5) {
    return {
      brandCode: parts[0] || '',
      adGroupCode: parts[1] || '',
      recipeCode: parts[2] || '',
      aspectRatio: parts[3] || '',
      version: undefined,
    };
  }
  const [brandCode, adGroupCode, recipeCode, aspectRatio, versionPart] = parts;
  const match = /^V(\d+)/i.exec(versionPart);
  return {
    brandCode,
    adGroupCode,
    recipeCode,
    aspectRatio,
    version: match ? parseInt(match[1], 10) : undefined,
  };
}
