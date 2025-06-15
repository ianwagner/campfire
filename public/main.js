import { messaging } from './firebase-init.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging.js';

async function initMessaging() {
  console.log('🔔 Requesting notification permission...');
  const permission = await Notification.requestPermission();
  console.log('Permission status:', permission);

  if (permission !== 'granted') {
    console.log('❌ Notifications not granted.');
    return;
  }

  console.log('🛠️ Registering service worker...');
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js'); // 🔥 Fixed here
  console.log('✅ Service worker registered:', registration);

  try {
    console.log('📬 Getting FCM token...');
    const token = await getToken(messaging, {
      vapidKey: window.FIREBASE_CONFIG?.vapidKey,
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

