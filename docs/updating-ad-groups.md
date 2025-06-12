# Updating Ad Group Documents

This example shows how to safely update an ad group without relying on `updateTime` and how permissions are enforced.

## Security Rule Requirements
A user may update an ad group document only if they are an admin or they originally uploaded the group. See `firestore.rules` lines 46-54:

```rules
match /adGroups/{groupId} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update, delete: if isAdmin() || (request.auth != null && resource.data.uploadedBy == request.auth.uid);
}
```

## Simplified Update
Use the Firestore SDK `updateDoc` helper and omit `currentDocument` and `updateMask`.

```javascript
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../src/firebase/config';

export async function lockAdGroup(groupId, user) {
  await updateDoc(doc(db, 'adGroups', groupId), {
    status: 'locked',
    lockedBy: user.displayName,
    lockedByUid: user.uid,
    reviewProgress: 0,
  });
}
```

Firestore automatically checks the latest `updateTime`, so removing the stale value avoids `FAILED_PRECONDITION` errors. Ensure `user` satisfies the rule above before calling this function.

