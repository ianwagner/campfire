import admin from "firebase-admin";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

let firestoreInstance: FirebaseFirestore.Firestore | null = null;
let initializationError: Error | null = null;

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n");
}

function ensureInitialized(): void {
  if (admin.apps.length) {
    return;
  }

  const missing = [
    FIREBASE_PROJECT_ID ? null : "FIREBASE_PROJECT_ID",
    FIREBASE_CLIENT_EMAIL ? null : "FIREBASE_CLIENT_EMAIL",
    FIREBASE_PRIVATE_KEY ? null : "FIREBASE_PRIVATE_KEY",
  ].filter((value): value is string => Boolean(value));

  if (missing.length) {
    initializationError = new Error(
      `Missing Firebase Admin environment variables: ${missing.join(", ")}`
    );
    throw initializationError;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID!,
        clientEmail: FIREBASE_CLIENT_EMAIL!,
        privateKey: normalizePrivateKey(FIREBASE_PRIVATE_KEY!),
      }),
      projectId: FIREBASE_PROJECT_ID!,
    });
  } catch (error) {
    initializationError =
      error instanceof Error
        ? error
        : new Error("Failed to initialize Firebase Admin SDK");
    throw initializationError;
  }
}

export function getFirestore(): FirebaseFirestore.Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  ensureInitialized();

  if (initializationError) {
    throw initializationError;
  }

  firestoreInstance = admin.firestore();
  return firestoreInstance;
}

export function getAdminApp(): admin.app.App {
  ensureInitialized();

  if (!admin.apps.length) {
    if (initializationError) {
      throw initializationError;
    }

    throw new Error("Firebase Admin SDK failed to initialize");
  }

  return admin.app();
}

export function getInitializationError(): Error | null {
  return initializationError;
}

export { admin };
