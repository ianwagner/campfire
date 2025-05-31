const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS env var is not set.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

async function main() {
  const snap = await db.collectionGroup('responses').get();
  let count = 0;
  for (const doc of snap.docs) {
    await doc.ref.delete();
    count += 1;
  }
  console.log(`Deleted ${count} responses documents`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
