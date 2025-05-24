import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import DesignerSidebar from './DesignerSidebar';

const AdminAccountForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('client');
  const [brandCodes, setBrandCodes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const codes = brandCodes
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      await setDoc(doc(db, 'users', cred.user.uid), {
        role,
        brandCodes: codes,
      });
      setSuccess('Account created');
      setEmail('');
      setPassword('');
      setRole('client');
      setBrandCodes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <DesignerSidebar />
      <div className="flex-grow p-4 max-w-md mx-auto mt-10">
        <h1 className="text-2xl mb-4">Create Account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="client">Client</option>
              <option value="designer">Designer</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Brand Codes</label>
            <input
              type="text"
              value={brandCodes}
              onChange={(e) => setBrandCodes(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="comma,separated,codes"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}
          <button type="submit" className="w-full btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminAccountForm;
