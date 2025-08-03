import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Reads the current credit balance for a brand.
 * @param {string} brandId Firestore brand document ID
 * @returns {Promise<number>} credits value, defaulting to 0 if missing
 */
export async function getBrandCredits(brandId) {
  const snap = await getDoc(doc(db, 'brands', brandId));
  if (!snap.exists()) return 0;
  const data = snap.data();
  return typeof data.credits === 'number' ? data.credits : 0;
}

/**
 * Sets the credit balance for a brand to an explicit value.
 * @param {string} brandId Firestore brand document ID
 * @param {number} amount new credits amount
 */
export async function setBrandCredits(brandId, amount) {
  await updateDoc(doc(db, 'brands', brandId), { credits: amount });
}

/**
 * Adjusts the credit balance by a delta.
 * @param {string} brandId Firestore brand document ID
 * @param {number} delta amount to increment (or decrement)
 */
export async function adjustBrandCredits(brandId, delta) {
  await updateDoc(doc(db, 'brands', brandId), { credits: increment(delta) });
}

