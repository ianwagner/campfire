import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, getDocs, query, where, limit } from 'firebase/firestore';
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

    setLoading(true);
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
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
        setLoading(false);
      },
      (err) => {
        console.error('Failed to fetch user role', err);
        setRole(null);
        setBrandCodes([]);
        setAgencyId(null);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (agencyId || brandCodes.length === 0) return;
    let cancelled = false;
    const fetchAgency = async () => {
      try {
        const q = query(
          collection(db, 'brands'),
          where('code', 'in', brandCodes),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!cancelled && !snap.empty) {
          setAgencyId(snap.docs[0].data().agencyId || null);
        }
      } catch (err) {
        console.error('Failed to fetch brand agency', err);
      }
    };
    fetchAgency();
    return () => {
      cancelled = true;
    };
  }, [brandCodes, agencyId]);

  return { role, brandCodes, agencyId, loading };
};

export default useUserRole;
