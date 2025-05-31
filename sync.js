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
    range: 'Recipes!A:Z',
  });

  const rows = data.values || [];
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (keyword) => header.findIndex((h) => h.includes(keyword));
  const recipeCol = findCol('recipe');
  const offerCol = findCol('offer');
  const audienceCol = findCol('audience');
  const angleCol = findCol('angle');

  const recipes = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const recipeNumber =
      recipeCol >= 0 ? (row[recipeCol] || '').toString().trim() : undefined;
    if (!recipeNumber) continue;
    recipes.push({
      recipeNumber: recipeNumber.toString(),
      offer: offerCol >= 0 ? row[offerCol] || '' : '',
      audience: audienceCol >= 0 ? row[audienceCol] || '' : '',
      angle: angleCol >= 0 ? row[angleCol] || '' : '',
    });
  }
  return recipes;
}

async function syncGroup(doc) {
  const batchData = doc.data();
  const sheetId = batchData.sheetId;
  if (!sheetId) return;
  const clientId = batchData.clientId;

  const recipes = await fetchRecipes(sheetId);
  for (const r of recipes) {
    await db
      .collection('adGroups')
      .doc(doc.id)
      .collection('recipes')
      .doc(r.recipeNumber)
      .set({
        clientId,
        recipeNumber: r.recipeNumber,
        offer: r.offer,
        audience: r.audience,
        angle: r.angle,
      });
  }
  console.log(`Synced ${recipes.length} recipes for group ${doc.id}`);
}

async function main() {
  const snapshot = await db.collection('adGroups').get();
  for (const doc of snapshot.docs) {
    await syncGroup(doc);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
