import { collection, getDocs, limit, query, where } from 'firebase/firestore';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 16;

const createSlug = (length = DEFAULT_LENGTH) => {
  let slug = '';
  const alphabetLength = ALPHABET.length;
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * alphabetLength);
    slug += ALPHABET[index];
  }
  return slug;
};

export const generateUniquePublicSlug = async (db, maxAttempts = 8) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = createSlug();
    const slugQuery = query(
      collection(db, 'brands'),
      where('publicDashboardSlug', '==', slug),
      limit(1)
    );
    const snapshot = await getDocs(slugQuery);
    if (snapshot.empty) {
      return slug;
    }
  }
  throw new Error('Failed to generate unique public slug');
};

export default generateUniquePublicSlug;
