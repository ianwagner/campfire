import React, { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';

const AdminBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', agencyId: '' });

  useEffect(() => {
    const fetchBrands = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'brands'));
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
  }, []);

  const startEdit = (brand) => {
    setEditId(brand.id);
    setForm({
      code: brand.code || '',
      name: brand.name || '',
      agencyId: brand.agencyId || '',
    });
  };

  const cancelEdit = () => setEditId(null);

  const handleSave = async (id) => {
    try {
      await updateDoc(doc(db, 'brands', id), {
        code: form.code,
        name: form.name,
        agencyId: form.agencyId,
      });
      setBrands((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, code: form.code, name: form.name, agencyId: form.agencyId }
            : b
        )
      );
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
        <a href="/admin/brands/new" className="underline text-blue-500 block mb-2">Add Brand</a>
        {loading ? (
          <p>Loading brands...</p>
        ) : brands.length === 0 ? (
          <p>No brands found.</p>
        ) : (
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Code</th>
                <th className="border px-2 py-1">Name</th>
                <th className="border px-2 py-1">Agency ID</th>
                <th className="border px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id}>
                  <td className="border px-2 py-1">
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
                  <td className="border px-2 py-1">
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
                  <td className="border px-2 py-1">
                    {editId === brand.id ? (
                      <input
                        type="text"
                        value={form.agencyId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, agencyId: e.target.value }))
                        }
                        className="w-full p-1 border rounded"
                      />
                    ) : (
                      brand.agencyId || ''
                    )}
                  </td>
                  <td className="border px-2 py-1 text-center">
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
        )}
      </div>
    );
};

export default AdminBrands;
