import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { DEFAULT_ACCENT_COLOR } from './themeColors';

const defaultAgency = { logoUrl: '', themeColor: DEFAULT_ACCENT_COLOR };

const getStoredAgency = (id) => {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(`agencyTheme-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const hexToRgba = (hex, alpha = 1) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const useAgencyTheme = (agencyId) => {
  const [agency, setAgency] = useState(() => {
    if (!agencyId) return defaultAgency;
    const stored = getStoredAgency(agencyId);
    const initial = stored ? { ...defaultAgency, ...stored } : defaultAgency;
    const color = initial.themeColor || defaultAgency.themeColor;
    document.documentElement.style.setProperty('--accent-color', color);
    document.documentElement.style.setProperty(
      '--accent-color-10',
      hexToRgba(color, 0.1)
    );
    return initial;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgency = async () => {
      if (!agencyId) {
        setAgency(defaultAgency);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'agencies', agencyId));
        if (snap.exists()) {
          const data = snap.data();
          const updated = { ...defaultAgency, ...data };
          setAgency(updated);
          const color = data.themeColor || defaultAgency.themeColor;
          document.documentElement.style.setProperty('--accent-color', color);
          document.documentElement.style.setProperty(
            '--accent-color-10',
            hexToRgba(color, 0.1)
          );
          localStorage.setItem(
            `agencyTheme-${agencyId}`,
            JSON.stringify({ logoUrl: updated.logoUrl, themeColor: color })
          );
        } else {
          setAgency(defaultAgency);
          localStorage.removeItem(`agencyTheme-${agencyId}`);
        }
      } catch (err) {
        console.error('Failed to fetch agency', err);
        setAgency(defaultAgency);
        if (agencyId) {
          localStorage.removeItem(`agencyTheme-${agencyId}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAgency();
  }, [agencyId]);

  const saveAgency = async (data) => {
    if (!agencyId) return;
    await setDoc(doc(db, 'agencies', agencyId), data, { merge: true });
    setAgency((prev) => {
      const updated = { ...prev, ...data };
      const color = updated.themeColor || defaultAgency.themeColor;
      document.documentElement.style.setProperty('--accent-color', color);
      document.documentElement.style.setProperty(
        '--accent-color-10',
        hexToRgba(color, 0.1)
      );
      localStorage.setItem(
        `agencyTheme-${agencyId}`,
        JSON.stringify({ logoUrl: updated.logoUrl, themeColor: color })
      );
      return updated;
    });
  };

  return { agency, loading, saveAgency };
};

export default useAgencyTheme;
