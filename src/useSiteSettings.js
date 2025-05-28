import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { applyAccentColor } from './utils/theme';

const storedAccent = localStorage.getItem('accentColor');
const defaultSettings = { logoUrl: '', accentColor: storedAccent || DEFAULT_ACCENT_COLOR };


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
            applyAccentColor(color);
            localStorage.setItem('accentColor', color);
          }
        } else {
          await setDoc(doc(db, 'settings', 'site'), defaultSettings);
          if (applyAccent) {
            applyAccentColor(defaultSettings.accentColor);
            localStorage.setItem('accentColor', defaultSettings.accentColor);
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
      applyAccentColor(settings.accentColor);
      localStorage.setItem('accentColor', settings.accentColor);
    }
  }, [settings.accentColor]);

  const saveSettings = async (newSettings) => {
    await setDoc(doc(db, 'settings', 'site'), newSettings, { merge: true });
    setSettings((prev) => ({ ...prev, ...newSettings }));
    if (newSettings.accentColor) {
      localStorage.setItem('accentColor', newSettings.accentColor);
    }
  };

  return { settings, loading, saveSettings };
};

export default useSiteSettings;
