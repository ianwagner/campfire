import { doc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
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
      history: arrayUnion(entry),
    },
    { merge: true },
  );
}
