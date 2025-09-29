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
const { shouldForceLongPolling, shouldAutoDetectLongPolling } = (() => {
  if (typeof navigator === 'undefined') {
    return {
      shouldForceLongPolling: false,
      shouldAutoDetectLongPolling: false,
    };
  }
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android/i.test(ua);

  if (!isIOS && !isSafari) {
    return {
      shouldForceLongPolling: false,
      shouldAutoDetectLongPolling: false,
    };
  }

  const parseMajor = (regex) => {
    const match = ua.match(regex);
    return match ? parseInt(match[1], 10) : null;
  };

  const iosMajor = parseMajor(/OS (\d+)_/);
  const safariMajor = parseMajor(/Version\/(\d+)/);
  const webkitMajor = parseMajor(/AppleWebKit\/(\d+)/);

  const needsLegacyTransport = () => {
    if (iosMajor && iosMajor < 16) {
      return true;
    }
    if (safariMajor && safariMajor < 16) {
      return true;
    }
    // When Safari omits the Version token (older desktop builds), fall back
    // to the WebKit engine version as a final heuristic.
    if (!safariMajor && webkitMajor && webkitMajor < 605) {
      return true;
    }
    return false;
  };

  const legacy = needsLegacyTransport();

  return {
    shouldForceLongPolling: legacy,
    // Allow modern Safari (16+) to fall back to long polling when necessary
    // without forcing the legacy transport outright. Other browsers continue
    // to use the default streaming transport.
    shouldAutoDetectLongPolling: !legacy,
  };
})();

const firestoreSettings = shouldForceLongPolling
  ? {
      // Force long polling for legacy Safari/iOS builds that still have
      // trouble with the default streaming implementation. Relying on the
      // legacy WebChannel transport causes authenticated listeners to send the
      // ID token in the query string, which in turn produces a stream of 400
      // errors for logged-in users (the bug reported in the review flow).
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    }
  : {
      // Allow modern Safari to auto-detect the optimal transport so it can use
      // streaming by default yet fall back gracefully if needed.
      experimentalAutoDetectLongPolling: shouldAutoDetectLongPolling,
      useFetchStreams: false,
    };

initializeFirestore(app, firestoreSettings);

// ✅ Export services you'll use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const messaging = getMessaging(app);
export { app };
