import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const useUserRole = (uid) => {
  const [role, setRole] = useState(null);
  const [brandCodes, setBrandCodes] = useState([]);
  const [agencyId, setAgencyId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setRole(null);
      setBrandCodes([]);
      setAgencyId(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const data = snap.data();
          setRole(data.role || null);
          const codes = Array.isArray(data.brandCodes) ? data.brandCodes : [];
          setBrandCodes(codes);
          setAgencyId(data.agencyId || null);
        } else {
          setRole(null);
          setBrandCodes([]);
          setAgencyId(null);
        }
      } catch (err) {
        console.error('Failed to fetch user role', err);
        setRole(null);
        setBrandCodes([]);
        setAgencyId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [uid]);

  return { role, brandCodes, agencyId, loading };
};

export default useUserRole;
