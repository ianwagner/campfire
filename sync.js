const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load variables from .env if present (without external dependencies)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

// Path to the service account key is read from the standard env var
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS env var is not set.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'tak-campfire.appspot.com',
});

const db = admin.firestore();
const bucketName = admin.app().options.storageBucket;

async function fetchRecipes(sheetId) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Recipes!A:J',
  });

  const rows = data.values || [];
  const recipes = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const filename = row[2];
    if (!filename) continue;
    recipes.push({
      filename,
      copy: row[7] || '',
      audience: row[8] || '',
      angle: row[9] || '',
    });
  }
  return recipes;
}

async function syncBatch(doc) {
  const batchData = doc.data();
  const sheetId = batchData.sheetId;
  if (!sheetId) return;
  const brandCode = batchData.brandCode;

  const recipes = await fetchRecipes(sheetId);
  for (const r of recipes) {
    const adUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(r.filename)}?alt=media`;
    await db
      .collection('adBatches')
      .doc(doc.id)
      .collection('ads')
      .doc(r.filename)
      .set({
        brandCode,
        filename: r.filename,
        adUrl,
        copy: r.copy,
        audience: r.audience,
        angle: r.angle,
      });
  }
  console.log(`Synced ${recipes.length} ads for batch ${doc.id}`);
}

async function main() {
  const snapshot = await db.collection('adBatches').get();
  for (const doc of snapshot.docs) {
    await syncBatch(doc);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
