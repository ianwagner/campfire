export default function selectRandomOption(val) {
  if (val === undefined || val === null) {
    return '';
  }
  let options = [];
  if (Array.isArray(val)) {
    options = val;
  } else if (typeof val === 'string') {
    options = val
      .split(/[;,\n]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (options.length === 0) {
    return '';
  }
  return options[Math.floor(Math.random() * options.length)];
}
