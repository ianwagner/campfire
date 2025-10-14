import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';

const chunkCodes = (codes = []) => {
  const list = [];
  for (let i = 0; i < codes.length; i += 10) {
    list.push(codes.slice(i, i + 10));
  }
  return list;
};

const normalizeCodes = (codes = []) =>
  codes
    .filter(Boolean)
    .map((code) => code.trim())
    .filter(Boolean);

export default function useBrandsByCode(codes = []) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const normalized = useMemo(() => normalizeCodes(codes), [codes]);
  const key = useMemo(() => normalized.slice().sort().join('|'), [normalized]);

  useEffect(() => {
    let cancelled = false;
    if (normalized.length === 0) {
      setBrands([]);
      setLoading(false);
      return undefined;
    }

    const load = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        const chunks = chunkCodes(normalized);
        const docs = [];
        for (const chunk of chunks) {
          const snap = await getDocs(query(base, where('code', 'in', chunk)));
          docs.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
        if (!cancelled) {
          setBrands(docs);
        }
      } catch (err) {
        console.error('Failed to load brands by code', err);
        if (!cancelled) {
          setBrands([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [key, normalized]);

  return { brands, loading };
}
