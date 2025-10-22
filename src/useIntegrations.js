import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase/config';

const sortIntegrations = (list) => {
  const safe = Array.isArray(list) ? list : [];
  return [...safe].sort((a, b) => {
    const first = (a?.name || a?.id || '').toString();
    const second = (b?.name || b?.id || '').toString();
    return first.localeCompare(second, undefined, { sensitivity: 'base' });
  });
};

const useIntegrations = ({ activeOnly = false } = {}) => {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const baseRef = collection(db, 'integrations');
    const constraints = [];
    if (activeOnly) {
      constraints.push(where('active', '==', true));
    }
    const source = constraints.length ? query(baseRef, ...constraints) : baseRef;

    const unsubscribe = onSnapshot(
      source,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setIntegrations(sortIntegrations(items));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Failed to load integrations', err);
        setIntegrations([]);
        setLoading(false);
        setError(err);
      },
    );

    return () => unsubscribe();
  }, [activeOnly]);

  return { integrations, loading, error };
};

export default useIntegrations;
