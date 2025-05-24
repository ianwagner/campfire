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

## Admin Role

The application now supports an **admin** role used to manage brands and user
accounts. Admins access their dashboard at `/dashboard/admin` which provides
links to additional pages for managing data:

- `/admin/brands` – view all brands and create new ones
- `/admin/brands/new` – form for creating a brand code
- `/admin/accounts` – manage clients and designers
- `/admin/accounts/new` – create a new user account

Creating a brand is typically the first step. Admins enter the brand name and a
unique code on the **New Brand** page. Once a brand exists, admins can create a
client or designer account from the **New Account** page and assign the brand
code to that user. Clients use these brand codes when requesting work so
designers see which assets belong to which brand.
