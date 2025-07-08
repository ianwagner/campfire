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

The script reads the `sheetId` field from each document in the `adGroups`
collection, loads rows from the `Recipes` tab, and writes metadata documents
under `adGroups/{groupId}/recipes/{recipeId}`. Metadata is matched using the
**Recipe Number** column and stored in a `metadata` subfield containing
`offer`, `audience`, and `angle`. Column positions are detected dynamically so
the sheet may reorder them without breaking the sync.

The values in the Recipe Number column should match the recipe identifiers
(e.g., `Recipe 1`, `Recipe 2`) used in Firestore.


## Environment Variables

The React application reads Firebase configuration values from Vite's
environment. Copy the provided `.env.example` to `.env` and fill in the
values for your project:

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key
VITE_OPENAI_API_KEY=your-openai-key
```

These values correspond to your Firebase project's configuration. Vite will load
them automatically when running `npm run dev` or `npm run build`.

Because the messaging demo scripts in `public/` are served without bundling,
`index.html` exposes these variables on `window.FIREBASE_CONFIG`. Ensure your
`.env` file is populated so the service worker and `public/main.js` receive a
valid API key.

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
Verify that `@google-cloud/storage` is listed in `functions/package.json` and
that your functions are exported by name in `index.js`. After deployment run:

```bash
firebase functions:list
```

to confirm the functions appear in your project.


## Admin Account Management

Visit `/admin/accounts` to view all user accounts. Admins can edit the audience,
role, or brand codes directly in the table and delete accounts when necessary. To create
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
controls. Selecting **Edit** on a brand row opens the brand profile page,
allowing administrators to update brand assets. New brands can be added via
`/admin/brands/new`.

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
await setDoc(doc(db, 'users', cred.user.uid), {
  role,
  audience: role,
  brandCodes: codes,
});
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

If a login attempt fails because of an incorrect password, the sign-in form will
offer a **Forgot password?** link. Selecting it triggers
`sendPasswordResetEmail` so the user can regain access. A confirmation message
displays once the email is sent.

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

## Safe Firestore Updates

Firestore snapshots include `createTime`, `updateTime`, and `readTime` fields
that cannot be written back with `updateDoc`. The helper at
`src/utils/safeUpdateDoc.js` removes these keys before updating:

```javascript
import { doc } from 'firebase/firestore';
import { db } from './firebase/config';
import { safeUpdateDoc } from './src/utils/safeUpdateDoc';

  await safeUpdateDoc(doc(db, 'example', id), {
    name: 'Updated',
    updateTime: 'ignored',
  });
  ```

## Table Component and Action Buttons

Admin screens share a simple `Table` component located at
`src/components/common/Table.jsx`. Wrap your headers and rows with `<Table>`
so they receive the standard scrolling container and `ad-table` classes:

```jsx
import Table from './components/common/Table';

<Table>
  <thead>{/* columns */}</thead>
  <tbody>{/* rows */}</tbody>
</Table>
```

Small icon buttons now use the `.btn-action` class. This applies compact
padding and an inline icon layout. Individual `px-1.5`, `py-0.5`, and `text-xs`
overrides are no longer needed:

```jsx
<button className="btn-action">
  <FiEdit2 />
  <span>Edit</span>
</button>
```

### Button Types

All button styles are defined in [src/global.css](src/global.css). Use these
classes for consistent actions:

- `.btn-primary` – main action buttons (submit, save)
- `.btn-secondary` – secondary or neutral actions
- `.btn-action` – compact icon buttons
- `.btn-approve`, `.btn-reject`, `.btn-edit`, `.btn-delete` – specialized
  review or destructive actions

Adjust colors or sizes by editing `src/global.css`.

## Theme Customization

Dark mode colors are defined in `src/global.css`. The `:root` section exposes CSS
variables so you can tweak the palette:

```css
:root {
  --accent-color: #ea580c;
  --accent-color-10: rgba(234, 88, 12, 0.1);
  --dark-bg: #0d1116;
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

## Simple Ad Review Flow

The `SimpleReview` component (`src/SimpleReview.jsx`) renders ads with minimal overhead. It preloads the next few images in memory (by default five) and only keeps a single image element in the DOM. Transitions are plain fade animations and no cache-busting query parameters are added to ad URLs.

```jsx
import SimpleReview from './src/SimpleReview.jsx';

const ads = ['https://example.com/ad1.png', 'https://example.com/ad2.png'];

<SimpleReview ads={ads} />;
```

## Password Protected Review Links

Ad group review links can be secured with a password. When sharing a link from
the dashboard a random 12 character password is generated and stored on the ad
group document. Reviewers must enter this password the first time they open the
link. After a successful entry the password is saved in `localStorage` so future
visits skip the prompt.


## Ad Recipe Setup

The [Ad Recipe Setup](docs/ad-recipe-setup.md) tab lets administrators define the form shown to users when creating a recipe. Inputs can include free-text fields and predefined components. Submitted options are matched together to produce the final ad recipe. The result is added to a table with columns for component values, copy, and the recipe number (table columns: component values, copy, recipe number).

### Asset Type Normalization

When uploading an asset CSV you may include an optional `assetType` column. The
application normalizes this value to simplify filtering. Values are matched
case-insensitively and common synonyms map to a canonical type. The words
`still`, `image`, `static`, `img`, `picture`, and `photo` are all stored as
`image`. The terms `video`, `motion`, `animated`, and `gif` become `video`.
Any unrecognized value is simply lowercased.

You can also populate assets directly from the in-app **Asset Library**. Click
the **Use Library** button in the recipe generator and the stored rows will be
loaded with all columns mapped automatically.

## Notification Automation

Administrators can configure notification rules under `/admin/notifications`.
Rules specify a trigger (`adGroupCreated`, `adGroupStatusUpdated`, or
`accountCreated`), a target audience and message templates. Placeholders like
`{{brandCode}}` or `{{status}}` are replaced with values from the event that
fired. When a rule matches, a notification document is created which causes the
`sendNotification` Cloud Function to distribute the message via FCM.

Notifications triggered by `adGroupCreated` or `adGroupStatusUpdated` now include a `url` field that points to the related ad group. The Designer notification UI uses this to make the message clickable so users can jump directly to the group details.

If a rule outputs a `brandCode` value, only users with that code in their `brandCodes` array will receive the notification.

