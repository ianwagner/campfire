import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';

const NotificationSettingsForm = () => {
  const user = auth.currentUser;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setEnabled(!!snap.data()?.notificationsEnabled);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  const handleChange = async (e) => {
    const value = e.target.checked;
    setError('');
    if (value) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setError('Notification permission not granted');
        return;
      }
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationsEnabled: value,
      });
    } catch (err) {
      console.error('Failed to update notification setting', err);
      setError('Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="my-4">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleChange}
            disabled={saving}
          />
          Enable Push Notifications
        </label>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
};

export default NotificationSettingsForm;
