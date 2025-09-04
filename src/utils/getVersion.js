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
    return parseAdFilename(adOrName).version || 1;
  }
  return (
    adOrName.version ||
    parseAdFilename(adOrName.filename || '').version ||
    1
  );
}
