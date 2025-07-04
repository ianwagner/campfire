import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';

export default function useCopyComponentTypes() {
  const [components, setComponents] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const copySnap = await getDocs(collection(db, 'copyComponentTypes'));
        const baseSnap = await getDocs(collection(db, 'componentTypes'));
        if (!cancelled) {
          const list = [
            ...baseSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            ...copySnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ];
          list.push({
            id: 'brand',
            key: 'brand',
            label: 'Brand',
            selectionMode: 'brand',
            attributes: [
              { label: 'Name', key: 'name', inputType: 'text' },
              { label: 'Tone of Voice', key: 'toneOfVoice', inputType: 'text' },
              { label: 'Offering', key: 'offering', inputType: 'text' },
            ],
          });
          list.push({
            id: 'product',
            key: 'product',
            label: 'Product',
            selectionMode: 'checklist',
            attributes: [
              { label: 'Name', key: 'name', inputType: 'text' },
              { label: 'Description', key: 'description', inputType: 'text' },
              { label: 'Benefits', key: 'benefits', inputType: 'text' },
            ],
          });
          setComponents(list);
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
