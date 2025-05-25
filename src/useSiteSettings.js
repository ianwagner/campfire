import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const defaultSettings = { logoUrl: '', accentColor: '#ea580c' };

const useSiteSettings = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
          const data = snap.data();
          setSettings({ ...defaultSettings, ...data });
          if (data.accentColor) {
            document.documentElement.style.setProperty(
              '--accent-color',
              data.accentColor
            );
          }
        } else {
          await setDoc(doc(db, 'settings', 'site'), defaultSettings);
          document.documentElement.style.setProperty(
            '--accent-color',
            defaultSettings.accentColor
          );
        }
      } catch (err) {
        console.error('Failed to fetch site settings', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings.accentColor) {
      document.documentElement.style.setProperty(
        '--accent-color',
        settings.accentColor
      );
    }
  }, [settings.accentColor]);

  const saveSettings = async (newSettings) => {
    await setDoc(doc(db, 'settings', 'site'), newSettings, { merge: true });
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return { settings, loading, saveSettings };
};

export default useSiteSettings;
