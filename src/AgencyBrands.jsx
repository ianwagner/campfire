import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';

const AgencyBrands = () => {
  const agencyId = new URLSearchParams(useLocation().search).get('agencyId');
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchBrands = async () => {
      if (!agencyId) { setBrands([]); setLoading(false); return; }
      setLoading(true);
      try {
        const q = query(collection(db, 'brands'), where('agencyId', '==', agencyId));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBrands(list);
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      } finally {
        setLoading(false);
      }
    };
    fetchBrands();
  }, [agencyId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!agencyId || !form.code.trim()) return;
    setMessage('');
    try {
      const docRef = await addDoc(collection(db, 'brands'), {
        code: form.code.trim(),
        name: form.name.trim(),
        agencyId,
        createdAt: serverTimestamp(),
      });
      setBrands((prev) => [...prev, { id: docRef.id, code: form.code.trim(), name: form.name.trim(), agencyId }]);
      setForm({ code: '', name: '' });
      setMessage('Brand added');
    } catch (err) {
      console.error('Failed to add brand', err);
      setMessage('Failed to add brand');
    }
  };

  const startEdit = (brand) => {
    setEditId(brand.id);
    setForm({ code: brand.code || '', name: brand.name || '' });
  };

  const cancelEdit = () => setEditId(null);

  const handleSave = async (id) => {
    try {
      await updateDoc(doc(db, 'brands', id), { code: form.code, name: form.name });
      setBrands((prev) => prev.map((b) => (b.id === id ? { ...b, code: form.code, name: form.name } : b)));
      setEditId(null);
    } catch (err) {
      console.error('Failed to update brand', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this brand?')) return;
    try {
      await deleteDoc(doc(db, 'brands', id));
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Failed to delete brand', err);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Brands</h1>
      <form onSubmit={handleAdd} className="space-y-2 max-w-sm mb-6">
        <div>
          <label className="block mb-1 text-sm font-medium">Code</label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full p-2 border rounded"
          />
        </div>
        {message && <p className="text-sm">{message}</p>}
        <button type="submit" className="btn-primary">
          Add Brand
        </button>
      </form>
      {loading ? (
        <p>Loading brands...</p>
      ) : brands.length === 0 ? (
        <p>No brands found.</p>
      ) : (
        <div className="overflow-x-auto table-container">
        <table className="ad-table min-w-max">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  {editId === brand.id ? (
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      className="w-full p-1 border rounded"
                    />
                  ) : (
                    brand.code
                  )}
                </td>
                <td>
                  {editId === brand.id ? (
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full p-1 border rounded"
                    />
                  ) : (
                    brand.name
                  )}
                </td>
                <td className="text-center">
                  {editId === brand.id ? (
                    <>
                      <button onClick={() => handleSave(brand.id)} className="underline text-blue-500 mr-2">
                        Save
                      </button>
                      <button onClick={cancelEdit} className="underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(brand)} className="underline text-blue-500 mr-2">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(brand.id)} className="underline btn-delete">
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
};

export default AgencyBrands;
