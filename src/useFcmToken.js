import { useEffect } from 'react';
import { onMessage } from 'firebase/messaging';
import { messaging } from './firebase/config';

const useFcmToken = (enabled) => {
  useEffect(() => {
    if (!enabled) return;
    const unsub = onMessage(messaging, () => {});
    return unsub;
  }, [enabled]);
};

export default useFcmToken;
