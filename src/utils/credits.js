import {
  doc,
  getDoc,
  updateDoc,
  increment,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';

/**
 * Retrieves the credit cost for a given action type.
 *
 * @param {string} type Action type key
 * @param {Record<string, number>} [creditCosts] Optional costs map from
 *   useSiteSettings
 * @returns {Promise<number>} cost amount (defaults to 0 if undefined)
 */
export async function getCreditCost(type, creditCosts) {
  if (creditCosts && typeof creditCosts[type] === 'number') {
    return creditCosts[type];
  }
  const snap = await getDoc(doc(db, 'settings', 'site'));
  const cost = snap.data()?.creditCosts?.[type];
  return typeof cost === 'number' ? cost : 0;
}

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
export async function adjustBrandCredits(brandId, delta, action = 'adjust', refId) {
  const brandRef = doc(db, 'brands', brandId);
  await updateDoc(brandRef, { credits: increment(delta) });
  try {
    const brandSnap = await getDoc(brandRef);
    const code = brandSnap.data()?.code || null;
    if (!code) {
      console.warn('adjustBrandCredits called for brand without brandCode', brandId);
    }
    await addDoc(collection(db, 'creditLogs'), {
      brandCode: code,
      userId: auth.currentUser?.uid || null,
      action,
      amount: delta,
      refId: refId ?? brandId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to log credit adjustment', err);
  }
}

/**
 * Deducts credits from a brand based on an action type.
 * Looks up the cost in site settings and records a log entry.
 *
 * @param {string} brandCode Brand code identifier
 * @param {string} type Action type (e.g. 'projectCreation', 'editRequest')
 * @param {Record<string, number>} [creditCosts] Optional costs map from
 *   useSiteSettings to avoid an extra fetch
 */
export async function deductCredits(brandCode, type, creditCosts) {
  try {
    if (!brandCode) {
      console.warn('deductCredits called without brandCode');
      return;
    }
    const amount = await getCreditCost(type, creditCosts);
    if (amount <= 0) return;

    const brandSnap = await getDocs(
      query(collection(db, 'brands'), where('code', '==', brandCode))
    );
    if (brandSnap.empty) return;

    const brandDoc = brandSnap.docs[0];
    const current =
      typeof brandDoc.data().credits === 'number' ? brandDoc.data().credits : 0;
    await updateDoc(brandDoc.ref, { credits: current - amount });

    await addDoc(collection(db, 'creditLogs'), {
      brandCode,
      userId: auth.currentUser?.uid || null,
      action: type,
      amount: -amount,
      refId: brandSnap.docs[0].id,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to deduct credits', err);
  }
}

export async function deductRecipeCredits(brandCode, recipeTypeId) {
  try {
    if (!brandCode || !recipeTypeId) {
      console.warn('deductRecipeCredits called without brandCode or recipeTypeId');
      return;
    }
    const typeSnap = await getDoc(doc(db, 'recipeTypes', recipeTypeId));
    if (!typeSnap.exists()) return;
    const data = typeSnap.data();
    const amount =
      typeof data.creditCost === 'number'
        ? data.creditCost
        : typeof data.credits === 'number'
        ? data.credits
        : 0;
    if (amount <= 0) return;
    await deductCredits(brandCode, 'recipeSave', { recipeSave: amount });
  } catch (err) {
    console.error('Failed to deduct recipe credits', err);
  }
}

