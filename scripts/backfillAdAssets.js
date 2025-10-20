const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  getDocs,
  collection,
  setDoc,
  doc,
} = require('firebase/firestore');

// Load environment variables from a local .env file if present so the script
// mirrors the runtime configuration used by the app.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `Missing Firebase environment variables: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function backfill() {
  console.log('Starting ad asset backfill...');
  const groupSnap = await getDocs(collection(db, 'adGroups'));
  console.log(`Found ${groupSnap.docs.length} ad groups.`);

  for (const groupDoc of groupSnap.docs) {
    const groupId = groupDoc.id;
    const groupData = groupDoc.data() || {};
    const { brandCode } = groupData;

    console.log(`Processing group ${groupId}...`);
    const assetsSnap = await getDocs(
      collection(db, 'adGroups', groupId, 'assets'),
    );

    for (const assetDoc of assetsSnap.docs) {
      const assetData = assetDoc.data();
      if (!assetData) continue;
      const assetId = assetDoc.id;

      const payload = {
        ...assetData,
        brandCode: assetData.brandCode || brandCode || '',
      };

      await setDoc(doc(db, 'adAssets', assetId), payload, { merge: true });
    }
  }

  console.log('Backfill completed successfully.');
}

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Ensure the process terminates once all Firestore work is complete.
    process.exit();
  });
