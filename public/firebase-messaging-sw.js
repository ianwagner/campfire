importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

console.log('FCM service worker loading...');

firebase.initializeApp({
  apiKey: 'AIzaSyDZ7h9KXAwIvzqFf9gMrMBOJvkMxSMjjRw',
  authDomain: 'tak-campfire.firebaseapp.com',
  projectId: 'tak-campfire',
  storageBucket: 'tak-campfire-main',
  messagingSenderId: '198332728326',
  appId: '1:198332728326:web:d7eec9d577fb30fa916f87'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message', payload);

  const notificationTitle = payload.notification?.title || 'Background Message';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: 'https://storage.googleapis.com/tak-campfire-main/Campfire/site-logo/SMOL.png',
  };

  // self.registration.showNotification(notificationTitle, notificationOptions);
});
