export default function generatePassword() {
  const length = 12;
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(array, (x) => chars[x % chars.length]).join('');
}
