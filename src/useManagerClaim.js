import { useEffect, useState } from 'react';
import { onIdTokenChanged, getIdTokenResult } from 'firebase/auth';
import { auth } from './firebase/config';
import debugLog from './utils/debugLog';

const useManagerClaim = () => {
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    debugLog('Listening for manager claim');
    const unsub = onIdTokenChanged(auth, async (user) => {
      debugLog('Id token changed', user);
      setIsReady(false);
      if (user) {
        try {
          await user.getIdToken(true);
          const res = await getIdTokenResult(user);
          setIsManager(!!res.claims.manager);
        } catch (err) {
          console.error('Failed to get token claims', err);
          setIsManager(false);
        }
      } else {
        setIsManager(false);
      }
      setIsReady(true);
      setLoading(false);
    });
    return () => {
      debugLog('Stop listening for manager claim');
      unsub();
    };
  }, []);

  return { isManager, loading, isReady };
};

export default useManagerClaim;
