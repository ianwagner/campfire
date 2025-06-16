export default function isVideoUrl(url) {
  if (!url) return false;
  const clean = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/i.test(clean);
}
