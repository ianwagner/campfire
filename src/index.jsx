import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .catch((err) => console.error('Service worker registration failed', err));
}

if (import.meta.env.DEV) {
  const warnIfBase64Bg = (el) => {
    if (el && el.style) {
      const bg = el.style.backgroundImage || '';
      if (bg.startsWith('url("data:image') || bg.startsWith("url('data:image") || bg.startsWith('data:image')) {
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
