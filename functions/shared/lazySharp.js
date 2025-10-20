let sharpPromise;

export async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((mod) => mod.default || mod);
  }
  return sharpPromise;
}
