const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load variables from .env if present (same logic as sync.js)
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

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node setEditorClaim.js <uid>');
  process.exit(1);
}

admin
  .auth()
  .setCustomUserClaims(uid, { editor: true })
  .then(() => {
    console.log(`Editor claim set for user ${uid}`);
  })
  .catch((err) => {
    console.error('Error setting editor claim:', err);
    process.exit(1);
  });
