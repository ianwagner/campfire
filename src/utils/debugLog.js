export default function debugLog(...args) {
  if (import.meta.env.VITE_DEBUG_LOGS) {
    console.log(...args);
  }
}
