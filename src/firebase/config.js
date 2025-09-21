import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// ✅ Fixed: Correct Firebase config
// Configuration is read from the Vite environment so that sensitive values can
// be provided via a `.env` file.

// Ensure all required Firebase env vars are present so misconfiguration is
// caught before any Firebase calls are made.
const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const missing = requiredVars.filter((v) => !import.meta.env[v]);
if (missing.length) {
  const message = `Missing Firebase environment variables: ${missing.join(', ')}`;
  console.warn(message);
  throw new Error(message);
}
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // Bucket is manually created in Google Cloud Storage, not a Firebase-managed
  // bucket, so omit the `.appspot.com` suffix.
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// Use explicit Firestore initialization so we can tune the transport layer.
const shouldDisableFetchStreams = (() => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android/i.test(ua);
  // Only fall back to the legacy WebChannel transport on browsers that still
  // require it. For logged-in users on modern browsers, disabling fetch
  // streaming forces Firestore to put the ID token in the WebChannel query
  // string, which triggers 400 responses from the Listen endpoint.
  return isIOS || isSafari;
})();

const firestoreSettings = {
  experimentalAutoDetectLongPolling: true,
};

if (shouldDisableFetchStreams) {
  firestoreSettings.useFetchStreams = false;
}

initializeFirestore(app, firestoreSettings);

// ✅ Export services you'll use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const messaging = getMessaging(app);
export { app };
