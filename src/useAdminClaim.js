import { useEffect, useState } from 'react';
import { onIdTokenChanged, getIdTokenResult } from 'firebase/auth';
import { auth } from './firebase/config';
import debugLog from './utils/debugLog';

const useAdminClaim = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    debugLog('Listening for admin claim');
    const unsub = onIdTokenChanged(auth, async (user) => {
      debugLog('Id token changed', user);
      setIsReady(false);
      if (user) {
        try {
          const res = await getIdTokenResult(user);
          setIsAdmin(!!res.claims.admin);
        } catch (err) {
          console.error('Failed to get token claims', err);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setIsReady(true);
      setLoading(false);
    });
    return () => {
      debugLog('Stop listening for admin claim');
      unsub();
    };
  }, []);

  return { isAdmin, loading, isReady };
};

export default useAdminClaim;
