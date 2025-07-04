import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const defaultRules = {
  primaryRule: '',
  headlineRule: '',
  descriptionRule: '',
};

const useCopyRules = () => {
  const [rules, setRules] = useState(defaultRules);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'copyRules'));
        if (snap.exists()) {
          setRules({ ...defaultRules, ...snap.data() });
        } else {
          await setDoc(doc(db, 'settings', 'copyRules'), defaultRules);
        }
      } catch (err) {
        console.error('Failed to fetch copy rules', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const saveRules = async (newRules) => {
    await setDoc(doc(db, 'settings', 'copyRules'), newRules, { merge: true });
    setRules((prev) => ({ ...prev, ...newRules }));
  };

  return { rules, loading, saveRules };
};

export default useCopyRules;
