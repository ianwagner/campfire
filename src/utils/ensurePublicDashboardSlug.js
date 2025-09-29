import { doc, updateDoc } from 'firebase/firestore';
import { generateUniquePublicSlug } from './generatePublicSlug.js';

const ensurePublicDashboardSlug = async (db, brandId, existingSlug = '') => {
  const trimmedSlug = (existingSlug || '').trim();
  if (!brandId || trimmedSlug) {
    return trimmedSlug;
  }

  const newSlug = await generateUniquePublicSlug(db);
  await updateDoc(doc(db, 'brands', brandId), {
    publicDashboardSlug: newSlug,
  });

  return newSlug;
};

export default ensurePublicDashboardSlug;
