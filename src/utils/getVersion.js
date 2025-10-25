import parseAdFilename from './parseAdFilename';

/**
 * Determine the version number for an ad or filename.
 * Falls back to parsing the filename when the explicit
 * version field is missing, matching legacy review logic.
 *
 * @param {object|string} adOrName - Ad object or filename string.
 * @returns {number} The detected version, defaulting to 1.
 */
export default function getVersion(adOrName) {
  if (!adOrName) return 1;
  if (typeof adOrName === 'string') {
    return extractVersionFromString(adOrName);
  }
  if (adOrName.version) {
    return adOrName.version;
  }
  const filename = adOrName.filename || '';
  const parsed = parseAdFilename(filename).version;
  if (parsed) return parsed;
  return extractVersionFromString(filename);
}

function extractVersionFromString(value) {
  if (!value) return 1;
  const { version } = parseAdFilename(value);
  if (version) return version;
  const match = /(?:^|[_-])v(\d+)/i.exec(value);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 1;
}
