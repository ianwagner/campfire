import parseAdFilename from './parseAdFilename';

export default function detectMissingRatios(files, assets) {
  const existing = {};
  for (const a of assets) {
    if (a.status === 'archived') continue;
    const info = parseAdFilename(a.filename || '');
    const recipe = a.recipeCode || info.recipeCode || '';
    const ratio = a.aspectRatio || info.aspectRatio || '';
    if (!existing[recipe]) existing[recipe] = new Set();
    if (ratio) existing[recipe].add(ratio);
  }

  const incoming = {};
  for (const f of files) {
    const info = parseAdFilename(f.name);
    const recipe = info.recipeCode || '';
    const ratio = info.aspectRatio || '';
    if (!incoming[recipe]) incoming[recipe] = new Set();
    if (ratio) incoming[recipe].add(ratio);
  }

  const missing = {};
  for (const recipe of Object.keys(incoming)) {
    const existSet = existing[recipe] || new Set();
    const newSet = incoming[recipe];
    const diff = [...existSet].filter((r) => !newSet.has(r));
    if (diff.length > 0) missing[recipe] = diff;
  }
  return missing;
}
