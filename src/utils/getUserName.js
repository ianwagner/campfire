import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const nameCache = new Map();

export default async function getUserName(uid) {
  if (!uid) return '';
  if (nameCache.has(uid)) {
    return await nameCache.get(uid);
  }

  const fetchPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists()
        ? snap.data().fullName || snap.data().email || snap.id
        : uid;
    } catch (err) {
      console.error('Failed to fetch user name', err);
      return uid;
    }
  })();

  nameCache.set(uid, fetchPromise);
  const result = await fetchPromise;
  nameCache.set(uid, result);
  return result;
}
