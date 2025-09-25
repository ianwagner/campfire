const admin = require("firebase-admin");

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

const missingFirebaseEnvVars = [
  !FIREBASE_PROJECT_ID ? "FIREBASE_PROJECT_ID" : null,
  !FIREBASE_CLIENT_EMAIL ? "FIREBASE_CLIENT_EMAIL" : null,
  !FIREBASE_PRIVATE_KEY ? "FIREBASE_PRIVATE_KEY" : null,
].filter(Boolean);

let firebaseInitError;

if (!admin.apps.length) {
  if (missingFirebaseEnvVars.length) {
    firebaseInitError = new Error(
      `Missing Firebase Admin environment variables: ${missingFirebaseEnvVars.join(", ")}`,
    );
    console.error("Firebase Admin SDK initialization error:", firebaseInitError.message);
  } else {
    try {
      const normalizedPrivateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: normalizedPrivateKey,
        }),
        projectId: FIREBASE_PROJECT_ID,
      });
    } catch (error) {
      firebaseInitError = error;
      console.error("Firebase Admin SDK initialization error", error);
    }
  }
}

const db = admin.apps.length ? admin.firestore() : null;

module.exports = {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
};
