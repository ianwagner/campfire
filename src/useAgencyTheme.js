import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { applyAccentColor } from './utils/theme';

const defaultAgency = {
  logoUrl: '',
  themeColor: DEFAULT_ACCENT_COLOR,
  enableDescribeProject: true,
  enableGenerateBrief: true,
  allowedRecipeTypes: [],
};

const getStoredAgency = (id) => {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(`agencyTheme-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};


const useAgencyTheme = (agencyId) => {
  const [agency, setAgency] = useState(() => {
    if (!agencyId) return defaultAgency;
    const stored = getStoredAgency(agencyId);
    const initial = stored ? { ...defaultAgency, ...stored } : defaultAgency;
    const color = initial.themeColor || defaultAgency.themeColor;
    applyAccentColor(color);
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
          applyAccentColor(color);
          try {
            localStorage.setItem(
              `agencyTheme-${agencyId}`,
              JSON.stringify({ logoUrl: updated.logoUrl, themeColor: color })
            );
          } catch (e) {
            /* ignore */
          }
        } else {
          setAgency(defaultAgency);
          try {
            localStorage.removeItem(`agencyTheme-${agencyId}`);
          } catch (e) {
            /* ignore */
          }
        }
      } catch (err) {
        console.error('Failed to fetch agency', err);
        setAgency(defaultAgency);
        if (agencyId) {
          try {
            localStorage.removeItem(`agencyTheme-${agencyId}`);
          } catch (e) {
            /* ignore */
          }
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
      applyAccentColor(color);
      try {
        localStorage.setItem(
          `agencyTheme-${agencyId}`,
          JSON.stringify({ logoUrl: updated.logoUrl, themeColor: color })
        );
      } catch (e) {
        /* ignore */
      }
      return updated;
    });
  };

  return { agency, loading, saveAgency };
};

export default useAgencyTheme;
