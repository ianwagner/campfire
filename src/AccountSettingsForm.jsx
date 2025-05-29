import React, { useState } from 'react';
import { updateProfile, updateEmail, updatePassword, multiFactor } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import ThemeToggle from './ThemeToggle';
import useTheme from './useTheme';

const AccountSettingsForm = () => {
  const user = auth.currentUser;
  const [name, setName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const mfaEnrolled = user ? multiFactor(user).enrolledFactors.length > 0 : false;

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
      <p className="text-sm">Use the button to preview:</p>
      <ThemeToggle />
    </div>
  );
};

export default AccountSettingsForm;

