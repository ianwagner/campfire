import { messaging } from './firebase-init.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging.js';

async function initMessaging() {
  console.log('Requesting notification permission...');
  const permission = await Notification.requestPermission();
  console.log('Notification permission:', permission);

  if (permission !== 'granted') {
    console.log('Notifications not granted.');
    return;
  }

  console.log('Registering Firebase messaging service worker...');
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { type: 'module' });
  console.log('Service worker registered:', registration);

  try {
    console.log('Retrieving FCM token...');
    const token = await getToken(messaging, {
      vapidKey: 'BHVn4o8nW7nriA-hnKA_wGXtVnL5xy5-M-iE9bKQfLXDVnKMRb06pT7JT9CqOQFbPdiAVk1IHYg_XD4GFMEzwQ4',
      serviceWorkerRegistration: registration,
    });
    if (token) {
      console.log('FCM token:', token);
    } else {
      console.log('No registration token available.');
    }
  } catch (err) {
    console.error('An error occurred while retrieving token.', err);
  }
}

initMessaging();
