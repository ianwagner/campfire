import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { applyAccentColor } from './utils/theme';
import { applyFavicon } from './utils/favicon';
import debugLog from './utils/debugLog';

// Guard against browsers where localStorage may be unavailable (e.g. privacy
// mode). Accessing it can throw a DOMException, so wrap reads in try/catch.
let storedAccent = null;
try {
  storedAccent = localStorage.getItem('accentColor');
} catch (e) {
  storedAccent = null;
}
const defaultSettings = {
  logoUrl: '',
  iconUrl: '',
  campfireLogoUrl: '',
  accentColor: storedAccent || DEFAULT_ACCENT_COLOR,
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
      debugLog('Fetching site settings');
      try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
          const data = snap.data();
          setSettings({ ...defaultSettings, ...data });
          const color = data.accentColor || defaultSettings.accentColor;
          if (applyAccent) {
            applyAccentColor(color);
            try {
              localStorage.setItem('accentColor', color);
            } catch (e) {
              /* ignore */
            }
          }
        } else {
          await setDoc(doc(db, 'settings', 'site'), defaultSettings);
          if (applyAccent) {
            applyAccentColor(defaultSettings.accentColor);
            try {
              localStorage.setItem('accentColor', defaultSettings.accentColor);
            } catch (e) {
              /* ignore */
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch site settings', err);
      } finally {
        debugLog('Settings fetch finished');
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings.accentColor && applyAccent) {
      applyAccentColor(settings.accentColor);
      try {
        localStorage.setItem('accentColor', settings.accentColor);
      } catch (e) {
        /* ignore */
      }
    }
  }, [settings.accentColor]);

  useEffect(() => {
    if (settings.iconUrl) {
      applyFavicon(settings.iconUrl);
    }
  }, [settings.iconUrl]);

  const saveSettings = async (newSettings) => {
    debugLog('Saving site settings');
    await setDoc(doc(db, 'settings', 'site'), newSettings, { merge: true });
    debugLog('Site settings saved');
    setSettings((prev) => ({ ...prev, ...newSettings }));
    if (newSettings.accentColor) {
      try {
        localStorage.setItem('accentColor', newSettings.accentColor);
      } catch (e) {
        /* ignore */
      }
    }
  };

  return { settings, loading, saveSettings };
};

export default useSiteSettings;
