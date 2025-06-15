import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getMessaging, onBackgroundMessage } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-sw.js';

console.log('FCM service worker loading...');

const firebaseConfig = {
  apiKey: 'AIzaSyDZ7h9KXAwIvzqFf9gMrMBOJvkMxSMjjRw',
  authDomain: 'tak-campfire.firebaseapp.com',
  projectId: 'tak-campfire',
  storageBucket: 'tak-campfire-main',
  messagingSenderId: '198332728326',
  appId: '1:198332728326:web:d7eec9d577fb30fa916f87'
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

console.log('Firebase messaging service worker initialized');

onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message', payload);

  const notificationTitle = payload.notification?.title || 'Background Message';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/icons/icon-192x192.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
