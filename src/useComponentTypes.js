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
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
              { label: 'Url', key: 'url', inputType: 'text' },
              { label: 'Description', key: 'description', inputType: 'text' },
              { label: 'Benefits', key: 'benefits', inputType: 'text' },
            ],
          });
          list.push({
            id: 'campaign',
            key: 'campaign',
            label: 'Campaign',
            selectionMode: 'dropdown',
            attributes: [
              { label: 'Name', key: 'name', inputType: 'text' },
              { label: 'Details', key: 'details', inputType: 'list' },
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
