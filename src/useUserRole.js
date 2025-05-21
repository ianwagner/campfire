import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const useUserRole = (uid) => {
  const [role, setRole] = useState(null);
  const [brandCodes, setBrandCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setRole(null);
      setBrandCodes([]);
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
          const codes = data.brandCodes;
          if (Array.isArray(codes)) {
            setBrandCodes(codes);
          } else {
            setBrandCodes([]);
          }
        } else {
          setRole(null);
          setBrandCodes([]);
        }
      } catch (err) {
        console.error('Failed to fetch user role', err);
        setRole(null);
        setBrandCodes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [uid]);

  return { role, brandCodes, loading };
};

export default useUserRole;
