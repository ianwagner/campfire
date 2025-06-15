import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const defaultSettings = { notifyAdGroupStatusChange: true };

const useNotificationSettings = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'notifications'));
        if (snap.exists()) {
          setSettings({ ...defaultSettings, ...snap.data() });
        } else {
          await setDoc(doc(db, 'settings', 'notifications'), defaultSettings);
        }
      } catch (err) {
        console.error('Failed to fetch notification settings', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const saveSettings = async (data) => {
    await setDoc(doc(db, 'settings', 'notifications'), data, { merge: true });
    setSettings((prev) => ({ ...prev, ...data }));
  };

  return { settings, loading, saveSettings };
};

export default useNotificationSettings;
