import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default async function getUserName(uid) {
  if (!uid) return '';
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists()
      ? snap.data().fullName || snap.data().email || snap.id
      : uid;
  } catch (err) {
    console.error('Failed to fetch user name', err);
    return uid;
  }
}
