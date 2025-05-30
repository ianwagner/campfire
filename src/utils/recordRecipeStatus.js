import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export default async function recordRecipeStatus(adGroupId, recipeCode, status, userId) {
  if (!adGroupId || !recipeCode) return;
  const ref = doc(db, 'adGroups', adGroupId, 'recipes', recipeCode);
  const entry = {
    status,
    timestamp: serverTimestamp(),
    userId: userId || null,
  };
  await setDoc(
    ref,
    {
      status,
      lastUpdatedBy: userId || null,
      lastUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await addDoc(collection(db, 'adGroups', adGroupId, 'recipes', recipeCode, 'history'), entry);
}
