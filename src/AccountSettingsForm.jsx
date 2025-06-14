import React, { useState, useEffect } from 'react';
import { updateProfile, updateEmail, updatePassword, multiFactor } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { getToken, deleteToken } from 'firebase/messaging';
import { auth, db, messaging } from './firebase/config';
import useTheme from './useTheme';

const AccountSettingsForm = () => {
  const user = auth.currentUser;
  const [name, setName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const mfaEnrolled = user ? multiFactor(user).enrolledFactors.length > 0 : false;

  useEffect(() => {
    if (!user) return;
    const fetchPref = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const enabled = !!snap.data()?.notificationsEnabled;
        setNotificationsEnabled(enabled);
        if (enabled && Notification.permission === 'granted') {
          try {
            const reg = await navigator.serviceWorker.ready;
            await getToken(messaging, {
              vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
              serviceWorkerRegistration: reg,
            });
          } catch (err) {
            console.error('Failed to refresh FCM token', err);
          }
        }
      } catch (err) {
        console.error('Failed to load notification preference', err);
      }
    };
    fetchPref();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setMessage('');
    try {
      if (name && name !== user.displayName) {
        await updateProfile(user, { displayName: name });
        await updateDoc(doc(db, 'users', user.uid), { fullName: name });
      }
      if (email && email !== user.email) {
        await updateEmail(user, email);
        await updateDoc(doc(db, 'users', user.uid), { email });
      }
      if (password) {
        await updatePassword(user, password);
        setPassword('');
      }
      setMessage('Account updated');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleNotificationToggle = async (e) => {
    const checked = e.target.checked;
    setNotificationsEnabled(checked);
    if (!user) return;
    if (checked) {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setNotificationsEnabled(false);
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });
        if (token) {
          console.log('FCM token', token);
          await updateDoc(doc(db, 'users', user.uid), {
            notificationsEnabled: true,
            fcmToken: token,
          });
        }
      } catch (err) {
        console.error('Failed to enable notifications', err);
        setNotificationsEnabled(false);
      }
    } else {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          notificationsEnabled: false,
          fcmToken: '',
        });
        try {
          await deleteToken(messaging);
        } catch (err) {
          // ignore failure
        }
      } catch (err) {
        console.error('Failed to disable notifications', err);
      }
    }
  };

  return (
    <div className="min-h-screen p-4 space-y-4">
      <h1 className="text-2xl mb-4">Account Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block mb-1 text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Theme</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="enable-notifications"
            type="checkbox"
            checked={notificationsEnabled}
            onChange={handleNotificationToggle}
            className="w-4 h-4"
          />
          <label htmlFor="enable-notifications" className="text-sm font-medium">
            Enable Notifications
          </label>
        </div>
        <h2 className="text-xl mt-6">Login &amp; Security</h2>
        <div>
          <label className="block mb-1 text-sm font-medium">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <p className="text-xs text-gray-500">Leave blank to keep current password</p>
        </div>
        <div>
          <h3 className="text-lg font-medium flex items-center">
            Two-Factor Authentication
            {!mfaEnrolled && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">Recommended</span>
            )}
          </h3>
          <p className="text-sm text-gray-500 mb-2">
            Add an extra layer of security to your account by requiring a code when you sign in.
          </p>
          {mfaEnrolled && user?.metadata.lastLoginAt && (
            <p className="text-xs text-gray-500 mb-2">
              Last MFA login: {new Date(Number(user.metadata.lastLoginAt)).toLocaleString()}
            </p>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/mfa-settings')}
          >
            {mfaEnrolled ? 'Manage MFA' : 'Set Up MFA'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}
        <button type="submit" className="btn-primary">Save Changes</button>
      </form>
    </div>
  );
};

export default AccountSettingsForm;

