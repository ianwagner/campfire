import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const defaultTemplate = {
  title: "{{brandCode}}'s ads are {{status}}",
  body: ''
};

const useNotificationTemplate = () => {
  const [template, setTemplate] = useState(defaultTemplate);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const ref = doc(db, 'settings', 'notificationTemplate');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setTemplate({ ...defaultTemplate, ...snap.data() });
        } else {
          await setDoc(ref, defaultTemplate);
        }
      } catch (err) {
        console.error('Failed to fetch notification template', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplate();
  }, []);

  const saveTemplate = async (newTemplate) => {
    await setDoc(doc(db, 'settings', 'notificationTemplate'), newTemplate, { merge: true });
    setTemplate((prev) => ({ ...prev, ...newTemplate }));
  };

  return { template, loading, saveTemplate };
};

export default useNotificationTemplate;
