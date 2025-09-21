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
const shouldForceLongPolling = (() => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android/i.test(ua);

  if (isIOS || isSafari) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const normalize = (value = '') => value.toLowerCase().trim();
  const parseCsv = (value = '') =>
    value
      .split(',')
      .map((entry) => normalize(entry))
      .filter(Boolean);

  const { pathname = '', hostname = '' } = window.location || {};
  const isReviewPath = /^\/review(\/?|\b)/.test(pathname);
  const reviewHosts = parseCsv(import.meta.env.VITE_REVIEW_APP_HOSTS || '');
  const host = normalize(hostname);
  const isReviewHost = reviewHosts.some((entry) => {
    if (!entry) return false;
    if (entry.startsWith('.')) {
      return host.endsWith(entry);
    }
    return host === entry;
  });
  const isReviewEnvironment = isReviewPath || isReviewHost;

  if (!isReviewEnvironment) {
    return false;
  }

  const allowlist = parseCsv(import.meta.env.VITE_REVIEW_WEBCHANNEL_ALLOWLIST || '');

  if (allowlist.length === 0) {
    return true;
  }

  const normalizedUa = normalize(ua);
  const normalizedVendor = normalize(navigator.vendor || '');

  const isAllowlisted = allowlist.some((entry) => {
    if (entry.startsWith('ua:')) {
      return normalizedUa.includes(entry.slice(3));
    }
    if (entry.startsWith('vendor:')) {
      return normalizedVendor.includes(entry.slice(7));
    }
    if (entry.startsWith('host:')) {
      return host === entry.slice(5);
    }
    return normalizedUa.includes(entry);
  });

  return !isAllowlisted;
})();

const firestoreSettings = {
  experimentalAutoDetectLongPolling: true,
};

if (shouldForceLongPolling) {
  firestoreSettings.experimentalForceLongPolling = true;
}

initializeFirestore(app, firestoreSettings);

// ✅ Export services you'll use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const messaging = getMessaging(app);
export { app };
