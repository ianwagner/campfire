import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import debugLog from './utils/debugLog';

const defaultGuardrails = {
  maxLength: 60,
  noExclamation: false,
  noPrice: false,
  blocklist: [],
  avoidRepeatGreeting: false,
};

const useHeadlineGuardrails = () => {
  const [guardrails, setGuardrails] = useState(defaultGuardrails);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      debugLog('Fetching headline guardrails');
      try {
        const snap = await getDoc(doc(db, 'settings', 'headlineGuardrails'));
        if (snap.exists()) {
          setGuardrails({ ...defaultGuardrails, ...snap.data() });
        } else {
          await setDoc(doc(db, 'settings', 'headlineGuardrails'), defaultGuardrails);
          setGuardrails(defaultGuardrails);
        }
      } catch (err) {
        console.error('Failed to fetch headline guardrails', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const saveGuardrails = async (newSettings) => {
    debugLog('Saving headline guardrails');
    await setDoc(doc(db, 'settings', 'headlineGuardrails'), newSettings, { merge: true });
    setGuardrails((prev) => ({ ...prev, ...newSettings }));
  };

  return { guardrails, loading, saveGuardrails };
};

export default useHeadlineGuardrails;
