import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';

export default function useComponentTypes() {
  const [components, setComponents] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'componentTypes'));
        if (!cancelled) {
          setComponents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Failed to load component types', err);
        if (!cancelled) setComponents([]);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return components;
}
