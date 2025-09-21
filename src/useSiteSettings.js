import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { DEFAULT_MONTH_COLORS } from './constants';
import { applyAccentColor } from './utils/theme';
import { applyFavicon } from './utils/favicon';
import debugLog from './utils/debugLog';

// Guard against browsers where localStorage may be unavailable (e.g. privacy
// mode). Accessing it can throw a DOMException, so wrap reads in try/catch.
let storedAccent = null;
let storedMonthColors = null;
let storedTagStrokeWeight = null;
try {
  storedAccent = localStorage.getItem('accentColor');
  const mc = localStorage.getItem('monthColors');
  storedMonthColors = mc ? JSON.parse(mc) : null;
  const tsw = localStorage.getItem('tagStrokeWeight');
  storedTagStrokeWeight = tsw ? Number(tsw) : null;
} catch (e) {
  storedAccent = null;
  storedMonthColors = null;
  storedTagStrokeWeight = null;
}
const defaultSettings = {
  logoUrl: '',
  iconUrl: '',
  campfireLogoUrl: '',
  artworkUrl: '',
  accentColor: storedAccent || DEFAULT_ACCENT_COLOR,
  monthColors: storedMonthColors || DEFAULT_MONTH_COLORS,
  tagStrokeWeight: storedTagStrokeWeight || 1,
  creditCosts: {
    projectCreation: 1,
    editRequest: 1,
  },
};


/**
 * Fetches global site settings such as logo and accent color.
 *
 * @param {boolean} [applyAccent=true] When false the accent color CSS variables
 * will not be updated. This is useful on pages that manage their own theme
 * (e.g. agency pages).
 */
const useSiteSettings = (applyAccent = true, enabled = true) => {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchSettings = async () => {
      debugLog('Fetching site settings');
      try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
          const data = snap.data();
          const monthColors = data.monthColors || DEFAULT_MONTH_COLORS;
          const tagStrokeWeight =
            data.tagStrokeWeight != null
              ? data.tagStrokeWeight
              : defaultSettings.tagStrokeWeight;
          setSettings({
            ...defaultSettings,
            ...data,
            monthColors,
            tagStrokeWeight,
          });
          const color = data.accentColor || defaultSettings.accentColor;
          if (applyAccent) {
            applyAccentColor(color);
            try {
              localStorage.setItem('accentColor', color);
            } catch (e) {
              /* ignore */
            }
          }
          try {
            localStorage.setItem('monthColors', JSON.stringify(monthColors));
          } catch (e) {
            /* ignore */
          }
          try {
            localStorage.setItem('tagStrokeWeight', String(tagStrokeWeight));
          } catch (e) {
            /* ignore */
          }
        } else {
          const newDefaults = {
            ...defaultSettings,
            monthColors: DEFAULT_MONTH_COLORS,
            tagStrokeWeight: defaultSettings.tagStrokeWeight,
          };
          await setDoc(doc(db, 'settings', 'site'), newDefaults);
          if (applyAccent) {
            applyAccentColor(newDefaults.accentColor);
            try {
              localStorage.setItem('accentColor', newDefaults.accentColor);
            } catch (e) {
              /* ignore */
            }
          }
          try {
            localStorage.setItem('monthColors', JSON.stringify(newDefaults.monthColors));
          } catch (e) {
            /* ignore */
          }
          try {
            localStorage.setItem('tagStrokeWeight', String(newDefaults.tagStrokeWeight));
          } catch (e) {
            /* ignore */
          }
          setSettings(newDefaults);
        }
      } catch (err) {
        console.error('Failed to fetch site settings', err);
      } finally {
        debugLog('Settings fetch finished');
        setLoading(false);
      }
    };

    fetchSettings();
  }, [enabled]);

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

  useEffect(() => {
    if (settings.monthColors) {
      try {
        localStorage.setItem('monthColors', JSON.stringify(settings.monthColors));
      } catch (e) {
        /* ignore */
      }
    }
  }, [settings.monthColors]);

  useEffect(() => {
    if (settings.tagStrokeWeight != null) {
      try {
        localStorage.setItem('tagStrokeWeight', String(settings.tagStrokeWeight));
      } catch (e) {
        /* ignore */
      }
    }
  }, [settings.tagStrokeWeight]);

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
    if (newSettings.monthColors) {
      try {
        localStorage.setItem('monthColors', JSON.stringify(newSettings.monthColors));
      } catch (e) {
        /* ignore */
      }
    }
    if (newSettings.tagStrokeWeight != null) {
      try {
        localStorage.setItem('tagStrokeWeight', String(newSettings.tagStrokeWeight));
      } catch (e) {
        /* ignore */
      }
    }
  };

  return { settings, loading, saveSettings };
};

export default useSiteSettings;
