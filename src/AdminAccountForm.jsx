import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import TagInput from './components/TagInput.jsx';

const AdminAccountForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('client');
  const [brandCodes, setBrandCodes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrands(snap.docs.map((d) => d.data().code));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };
    fetchBrands();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const codes = brandCodes.filter(Boolean);
      await setDoc(doc(db, 'users', cred.user.uid), {
        role,
        brandCodes: codes,
      });
      await sendEmailVerification(cred.user);
      setSuccess('Account created. Ask the user to verify their email.');
      setEmail('');
      setPassword('');
      setRole('client');
      setBrandCodes([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto mt-10">
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
            <TagInput
              value={brandCodes}
              onChange={setBrandCodes}
              suggestions={brands}
              id="brand-code-input"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}
          <button type="submit" className="w-full btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </div>
    );
  };

export default AdminAccountForm;
