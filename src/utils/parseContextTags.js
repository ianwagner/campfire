export default function parseContextTags(str = '') {
  return str
    .toLowerCase()
    .split(/[;,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}
