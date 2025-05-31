import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export async function archiveGroup(groupId) {
  await updateDoc(doc(db, 'adGroups', groupId), {
    status: 'archived',
    archivedAt: serverTimestamp(),
    archivedBy: auth.currentUser?.uid || null,
  });
}

export async function restoreGroup(groupId) {
  await updateDoc(doc(db, 'adGroups', groupId), {
    status: 'pending',
    archivedAt: null,
    archivedBy: null,
  });
}
