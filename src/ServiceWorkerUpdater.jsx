import React, { useEffect, useState } from 'react';

const ServiceWorkerUpdater = () => {
  const [updateReady, setUpdateReady] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          setRegistration(registration);
          if (registration.waiting) {
            setUpdateReady(true);
          }

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  setUpdateReady(true);
                }
              });
            }
          });
        })
        .catch(() => {
          /* registration failed */
        });
    }
  }, []);

  const reload = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
      setUpdateReady(false);
    }
  };

  if (!updateReady) return null;

  return (
    <div
      onClick={reload}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 transform bg-[var(--accent-color)] text-white px-4 py-2 rounded shadow cursor-pointer z-50"
    >
      A new version of Campfire is available. Click to update.
    </div>
  );
};

export default ServiceWorkerUpdater;
