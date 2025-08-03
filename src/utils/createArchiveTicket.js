import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

export default async function createArchiveTicket(data) {
  if (!data?.brandCode) {
    console.warn('createArchiveTicket called without brandCode', data);
  }
  try {
    await addDoc(collection(db, 'requests'), {
      type: 'archive',
      status: 'new',
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null,
      ...data,
      brandCode: data?.brandCode || null,
    });
  } catch (err) {
    console.error('Failed to create archive ticket', err);
  }
}
