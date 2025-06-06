import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';

export default function useAssets() {
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'adAssets'));
        if (!cancelled) {
          setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Failed to load assets', err);
        if (!cancelled) setAssets([]);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return assets;
}
