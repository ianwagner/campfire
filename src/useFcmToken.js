import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { messaging, db } from './firebase/config';

const useFcmToken = (user, enabled = false) => {
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    if (!enabled) {
      setDoc(ref, { fcmToken: null }, { merge: true });
      return;
    }
    const getAndStore = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });
        if (token) {
          await setDoc(
            doc(db, 'users', user.uid),
            { fcmToken: token },
            { merge: true }
          );
        }
      } catch (err) {
        console.error('Failed to obtain FCM token', err);
      }
    };
    getAndStore();
    const unsub = onMessage(messaging, () => {});
    return unsub;
  }, [user, enabled]);
};

export default useFcmToken;
