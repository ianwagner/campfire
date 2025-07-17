import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './global.css';

// Set Firebase config from environment variables so it can be read by
// firebase-init.js which expects `window.FIREBASE_CONFIG` to already exist.
window.FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
};

// ----- React bootstrap -----
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Development helper from the previous index.jsx file
if (import.meta.env.DEV) {
  const warnIfBase64Bg = (el) => {
    if (el && el.style) {
      const bg = el.style.backgroundImage || '';
      if (
        bg.startsWith('url("data:image') ||
        bg.startsWith("url('data:image") ||
        bg.startsWith('data:image')
      ) {
        // eslint-disable-next-line no-console
        console.warn('Base64 background image detected:', el);
      }
    }
  };

  const observer = new MutationObserver((records) => {
    records.forEach((rec) => {
      if (rec.type === 'attributes' && rec.attributeName === 'style') {
        warnIfBase64Bg(rec.target);
      }
      rec.addedNodes.forEach((node) => warnIfBase64Bg(node));
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
    childList: true,
    subtree: true,
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failed */
    });
  });
}

// Load Firebase Messaging after the config is set
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
