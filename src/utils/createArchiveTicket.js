import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

export default async function createArchiveTicket(data) {
  try {
    await addDoc(collection(db, 'requests'), {
      type: 'archive',
      status: 'new',
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null,
      ...data,
    });
  } catch (err) {
    console.error('Failed to create archive ticket', err);
  }
}
