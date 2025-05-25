import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';

const AdminBrandForm = () => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!code.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'brands'), {
        code: code.trim(),
        name: name.trim(),
        createdAt: serverTimestamp(),
      });
      setCode('');
      setName('');
      setMessage('Brand added');
    } catch (err) {
      console.error('Failed to add brand', err);
      setMessage('Failed to add brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
        <h1 className="text-2xl mb-4">Add Brand</h1>
        <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
          <div>
            <label className="block mb-1 text-sm font-medium">Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          {message && <p className="text-sm text-center">{message}</p>}
          <button
            type="submit"
            className="w-full btn-primary"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Add Brand'}
          </button>
        </form>
      </div>
    );
};

export default AdminBrandForm;
