import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';

export default function useBrandProfile(code) {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!code) {
        setBrand(null);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', code));
        const snap = await getDocs(q);
        if (!cancelled) {
          if (!snap.empty) setBrand({ id: snap.docs[0].id, ...snap.docs[0].data() });
          else setBrand(null);
        }
      } catch (err) {
        console.error('Failed to fetch brand profile', err);
        if (!cancelled) setBrand(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return brand;
}
