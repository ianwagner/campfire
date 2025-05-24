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

## Environment Variables

The React application reads Firebase configuration values from Vite's
environment. Create a `.env` file in the project root with the following
variables:

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

These values correspond to your Firebase project's configuration. Vite will load
them automatically when running `npm run dev` or `npm run build`.

The `sync.js` utility also reads `GOOGLE_APPLICATION_CREDENTIALS` and
`FIREBASE_STORAGE_BUCKET` from the environment. If you use a `.env` file, include
those variables as well so `npm run sync` can locate your service account key and
bucket.

## Deploying to Vercel

When hosting on Vercel the application runs entirely in the browser. Client-side
routes therefore need a rewrite so any URL renders the app's `index.html`.
Create a `vercel.json` file with the following contents:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Without this rule Vercel would serve 404 pages for client-side routes. The
rewrite ensures navigation works correctly.

## Admin Account Management

Visit `/admin/accounts` to view all user accounts. Admins can edit the role or
brand codes directly in the table and delete accounts when necessary. To create
a new account use `/admin/accounts/new`, which opens the original creation
form. The form calls `createUserWithEmailAndPassword` and then writes a user
document to Firestore. Both operations are wrapped in a `try/catch` block. If
either step fails the error message is shown so the admin can correct the input
and retry.

## Admin Brand Management

Similarly, `/admin/brands` lists all brands with inline edit and delete
controls. New brands can be added via `/admin/brands/new`.
