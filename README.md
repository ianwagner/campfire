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
under `adBatches/{batchId}/recipes`. Metadata is matched using the **Recipe
Number** column and stored on the recipe itself (fields `offer`, `audience`, and
`angle`). Column positions are detected dynamically so the sheet may reorder
them without breaking the sync.

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

## Deploying Cloud Functions

The `functions` folder contains a Cloud Function triggered by `storage.object.finalize` that converts uploaded PNGs to WebP and creates a small thumbnail. Deploy the function with the Firebase CLI:

```bash
cd functions
npm install
firebase deploy --only functions
```


## Admin Account Management

Visit `/admin/accounts` to view all user accounts. Admins can edit the role or
brand codes directly in the table and delete accounts when necessary. To create
a new account use `/admin/accounts/new`, which opens the original creation
form. The form calls `createUserWithEmailAndPassword` and then writes a user
document to Firestore. Both operations are wrapped in a `try/catch` block. If
either step fails the error message is shown so the admin can correct the input
and retry.


## Setting Admin Custom Claims

After creating an admin user you need to assign the `admin` custom claim so the application recognizes the account as an administrator. Run the provided `setAdminClaim.js` script with the user's UID:

```bash
node setAdminClaim.js <uid>
```

The script loads your service account credentials from the `GOOGLE_APPLICATION_CREDENTIALS` environment variable (it also reads variables from `.env` if present). Once executed, the specified user will have `{ admin: true }` in their custom claims. You can verify this in the Firebase console or by fetching the user record with the Admin SDK.

## Admin Brand Management

Similarly, `/admin/brands` lists all brands with inline edit and delete
controls. New brands can be added via `/admin/brands/new`.

## Authentication

The project uses Firebase Authentication for admin access. The `Login` component
found in `src/Login.jsx` calls `signInWithEmailAndPassword` when the form is
submitted:

```jsx
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase/config';

await signInWithEmailAndPassword(auth, email, password);
```

Account creation occurs through `AdminAccountForm` which creates the Firebase
user and stores metadata in Firestore:

```jsx
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';

const cred = await createUserWithEmailAndPassword(auth, email, password);
await setDoc(doc(db, 'users', cred.user.uid), { role, brandCodes: codes });
```

Newly created accounts will automatically receive a verification email. They
must verify their address before they can enroll multi-factor authentication.

End users can self-register at `/signup`. The page collects basic information,
creates the Firebase account. Selecting "Agency" also creates a new `agencies`
document and stores the generated `agencyId` on the user record, while
selecting "Brand" results in a `client` role. All new accounts automatically
receive a verification email and are then directed to MFA enrollment.

Users can sign out from the sidebar. `AdminSidebar` exposes a logout button that
simply calls `signOut`:

```jsx
import { signOut } from 'firebase/auth';
import { auth } from './firebase/config';

signOut(auth);
```

Admin and client accounts must enroll a second factor. After signing in,
the app checks `multiFactor.enrolledFactors` for the user and redirects to
`/mfa-settings` if no factors are present. The enrollment screen sends an SMS
verification code and completes `multiFactor().enroll()` once confirmed.
Phone numbers entered on this screen are automatically formatted as E.164,
so typing `15555551234` will result in `+15555551234` in the field.

## Running Tests

Use Jest to run unit tests for React components. Install dependencies and run:

```bash
npm install
npm test
```

## Theme Customization

Dark mode colors are defined in `src/global.css`. The `:root` section exposes CSS
variables so you can tweak the palette:

```css
:root {
  --accent-color: #ea580c;
  --accent-color-10: rgba(234, 88, 12, 0.1);
  --dark-bg: #111827;
  --dark-text: #f3f4f6;
  --dark-sidebar-bg: #1f2937;
  --dark-sidebar-hover: #374151;
}
```

Update these values to change the site's dark theme without editing the markup.

## File and Logo Uploads

Assets uploaded through `uploadFile` and `uploadLogo` now include caching
metadata so browsers can store them for one year. Both functions call
`uploadBytes` with:

```javascript
{ cacheControl: 'public,max-age=31536000,immutable' }
```

which sets the appropriate `Cache-Control` header on the stored file.
