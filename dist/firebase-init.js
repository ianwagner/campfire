import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getMessaging } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging.js';

console.log('Initializing Firebase for messaging...');

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig || !firebaseConfig.apiKey) {
  throw new Error('Missing Firebase configuration.');
}

const app = initializeApp(firebaseConfig);

console.log('Firebase initialized');

export const messaging = getMessaging(app);
