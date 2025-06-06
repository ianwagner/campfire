const admin = require('firebase-admin');
const { google } = require('googleapis');
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
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'tak-campfire.appspot.com',
});

const db = admin.firestore();

function normalize(val) {
  return val.toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseTags(val) {
  if (!val) return [];
  return val
    .toString()
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function fetchRows(sheetId) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Assets!A:Z',
  });

  const rows = data.values || [];
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (keyword) => header.findIndex((h) => h.includes(keyword));
  const idCol = findCol('id');
  const nameCol = findCol('name');
  const linkCol = findCol('link');
  const audienceCol = findCol('audience');
  const angleCol = findCol('angle');
  const offerCol = findCol('offer');

  const items = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rawId = idCol >= 0 ? row[idCol] : row[nameCol];
    if (!rawId) continue;
    const item = {
      id: normalize(rawId),
      name: nameCol >= 0 ? row[nameCol] || '' : '',
      link: linkCol >= 0 ? row[linkCol] || '' : '',
      audienceTags: parseTags(audienceCol >= 0 ? row[audienceCol] : ''),
      angleTags: parseTags(angleCol >= 0 ? row[angleCol] : ''),
      offerTags: parseTags(offerCol >= 0 ? row[offerCol] : ''),
    };
    items.push(item);
  }
  return items;
}

async function importAssets(sheetId) {
  const assets = await fetchRows(sheetId);
  for (const a of assets) {
    await db.collection('adAssets').doc(a.id).set(a, { merge: true });
    console.log('Imported:', a.id);
  }
  console.log(`Imported ${assets.length} assets`);
}

const sheetId = process.argv[2];
if (!sheetId) {
  console.error('Usage: node importAssets.js <sheetId>');
  process.exit(1);
}

importAssets(sheetId).catch((err) => {
  console.error(err);
  process.exit(1);
});
