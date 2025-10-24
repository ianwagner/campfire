import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

const fetchBrandNamesByCode = async (codes = []) => {
  const unique = Array.from(new Set((codes || []).filter(Boolean)));
  if (unique.length === 0) return {};

  const map = {};
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    try {
      const snap = await getDocs(query(collection(db, 'brands'), where('code', 'in', chunk)));
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const code = data.code || docSnap.id;
        if (!code) return;
        map[code] = data.name || '';
      });
    } catch (err) {
      console.error('Failed to fetch brand names', err);
    }
  }

  return map;
};

export default fetchBrandNamesByCode;
