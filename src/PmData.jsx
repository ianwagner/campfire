import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import ClientData from './ClientData';

const normalizeCodes = (codes = []) =>
  Array.from(new Set(codes.filter((code) => typeof code === 'string' && code.trim()))).sort();

const PmData = () => {
  const user = auth.currentUser;
  const { agencyId, brandCodes: roleCodes } = useUserRole(user?.uid);
  const [brandCodes, setBrandCodes] = useState([]);

  useEffect(() => {
    let active = true;

    const applyCodes = (codes) => {
      if (!active) return;
      const normalized = normalizeCodes(codes);
      setBrandCodes((prev) => {
        const prevKey = prev.join('|');
        const nextKey = normalized.join('|');
        return prevKey === nextKey ? prev : normalized;
      });
    };

    const fetchCodes = async () => {
      if (agencyId) {
        try {
          const snap = await getDocs(
            query(collection(db, 'brands'), where('agencyId', '==', agencyId))
          );
          applyCodes(snap.docs.map((doc) => doc.data().code));
        } catch (err) {
          console.error('Failed to fetch agency brand codes', err);
          applyCodes([]);
        }
      } else if (Array.isArray(roleCodes) && roleCodes.length > 0) {
        applyCodes(roleCodes);
      } else {
        applyCodes([]);
      }
    };

    fetchCodes();

    return () => {
      active = false;
    };
  }, [agencyId, roleCodes]);

  return <ClientData brandCodes={brandCodes} />;
};

export default PmData;
