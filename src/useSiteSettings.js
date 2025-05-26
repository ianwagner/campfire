import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const defaultSettings = { logoUrl: '', accentColor: '#ea580c' };

const hexToRgba = (hex, alpha = 1) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Fetches global site settings such as logo and accent color.
 *
 * @param {boolean} [applyAccent=true] When false the accent color CSS variables
 * will not be updated. This is useful on pages that manage their own theme
 * (e.g. agency pages).
 */
const useSiteSettings = (applyAccent = true) => {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
          const data = snap.data();
          setSettings({ ...defaultSettings, ...data });
          const color = data.accentColor || defaultSettings.accentColor;
          if (applyAccent) {
            document.documentElement.style.setProperty(
              '--accent-color',
              color
            );
            document.documentElement.style.setProperty(
              '--accent-color-10',
              hexToRgba(color, 0.1)
            );
          }
        } else {
          await setDoc(doc(db, 'settings', 'site'), defaultSettings);
          if (applyAccent) {
            document.documentElement.style.setProperty(
              '--accent-color',
              defaultSettings.accentColor
            );
            document.documentElement.style.setProperty(
              '--accent-color-10',
              hexToRgba(defaultSettings.accentColor, 0.1)
            );
          }
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
    if (settings.accentColor && applyAccent) {
      document.documentElement.style.setProperty(
        '--accent-color',
        settings.accentColor
      );
      document.documentElement.style.setProperty(
        '--accent-color-10',
        hexToRgba(settings.accentColor, 0.1)
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
