import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const defaultAgency = { logoUrl: '', themeColor: '#00ABFF' };

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
  const [agency, setAgency] = useState(defaultAgency);
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
          setAgency({ ...defaultAgency, ...data });
          const color = data.themeColor || defaultAgency.themeColor;
          document.documentElement.style.setProperty('--accent-color', color);
          document.documentElement.style.setProperty(
            '--accent-color-10',
            hexToRgba(color, 0.1)
          );
        } else {
          setAgency(defaultAgency);
        }
      } catch (err) {
        console.error('Failed to fetch agency', err);
        setAgency(defaultAgency);
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
      return updated;
    });
  };

  return { agency, loading, saveAgency };
};

export default useAgencyTheme;
