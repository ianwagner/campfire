# Campfire

## Syncing Metadata from Google Sheets

This project includes a utility script `sync.js` that copies ad metadata from a
Google Sheet into Firestore.

### Setup

1. Install dependencies (Firebase Admin SDK and Google APIs):
   ```bash
   npm install
   ```
2. Provide a Firebase service account key and set the environment variable
   `GOOGLE_APPLICATION_CREDENTIALS` to its path. The storage bucket can be
   overridden with `FIREBASE_STORAGE_BUCKET`.
3. Run the script:
   ```bash
   npm run sync
   ```

The script reads the `sheetId` field from each document in the `adBatches`
collection, loads rows from the `Recipes` tab, and writes metadata documents
under `adBatches/{batchId}/ads`.
