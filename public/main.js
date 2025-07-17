// ✅ 1. Set Firebase config from env
window.FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
};

// ✅ 2. Import Firebase init *after* config is set
import('./firebase-init.js').then(async ({ messaging }) => {
  const { getToken } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging.js');

  async function initMessaging() {
    console.log('🔔 Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('Permission status:', permission);

    if (permission !== 'granted') {
      console.log('❌ Notifications not granted.');
      return;
    }

    console.log('🛠️ Registering service worker...');
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('✅ Service worker registered:', registration);

    try {
      console.log('📬 Getting FCM token...');
      const token = await getToken(messaging, {
        vapidKey: window.FIREBASE_CONFIG.vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (token) {
        console.log('✅ FCM token:', token);
      } else {
        console.log('⚠️ No registration token available.');
      }
    } catch (err) {
      console.error('❌ Error retrieving FCM token:', err);
    }
  }

  initMessaging();
});
