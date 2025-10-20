let sharpPromise;
const loadSharp = async () => (await import('@img/sharp')).default;

export async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = loadSharp();
  }
  return sharpPromise;
}
