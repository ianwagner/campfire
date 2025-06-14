import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase/config';

const useNotificationsEnabled = (uid) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!uid) {
      setEnabled(false);
      return;
    }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setEnabled(!!snap.data()?.notificationsEnabled);
      },
      () => setEnabled(false)
    );
    return unsub;
  }, [uid]);

  return enabled;
};

export default useNotificationsEnabled;
