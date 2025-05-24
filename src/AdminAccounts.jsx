import React, { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';
import AdminSidebar from './AdminSidebar';

const AdminAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ role: 'client', brandCodes: '' });

  useEffect(() => {
    const fetchAccounts = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAccounts(list);
      } catch (err) {
        console.error('Failed to fetch accounts', err);
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const startEdit = (acct) => {
    setEditId(acct.id);
    setForm({
      role: acct.role || 'client',
      brandCodes: Array.isArray(acct.brandCodes)
        ? acct.brandCodes.join(',')
        : '',
    });
  };

  const cancelEdit = () => setEditId(null);

  const handleSave = async (id) => {
    const codes = form.brandCodes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      await updateDoc(doc(db, 'users', id), {
        role: form.role,
        brandCodes: codes,
      });
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, role: form.role, brandCodes: codes } : a
        )
      );
      setEditId(null);
    } catch (err) {
      console.error('Failed to update account', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this account?')) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete account', err);
    }
  };

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-grow p-4">
        <h1 className="text-2xl mb-4">Accounts</h1>
        <a href="/admin/accounts/new" className="underline text-blue-500 block mb-2">Add Account</a>
        {loading ? (
          <p>Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p>No accounts found.</p>
        ) : (
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">ID</th>
                <th className="border px-2 py-1">Role</th>
                <th className="border px-2 py-1">Brand Codes</th>
                <th className="border px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acct) => (
                <tr key={acct.id}>
                  <td className="border px-2 py-1">{acct.id}</td>
                  <td className="border px-2 py-1">
                    {editId === acct.id ? (
                      <select
                        value={form.role}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, role: e.target.value }))
                        }
                        className="w-full p-1 border rounded"
                      >
                        <option value="client">Client</option>
                        <option value="designer">Designer</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      acct.role || ''
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    {editId === acct.id ? (
                      <input
                        type="text"
                        value={form.brandCodes}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, brandCodes: e.target.value }))
                        }
                        className="w-full p-1 border rounded"
                      />
                    ) : Array.isArray(acct.brandCodes) ? (
                      acct.brandCodes.join(', ')
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {editId === acct.id ? (
                      <>
                        <button
                          onClick={() => handleSave(acct.id)}
                          className="underline text-blue-500 mr-2"
                        >
                          Save
                        </button>
                        <button onClick={cancelEdit} className="underline">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(acct)}
                          className="underline text-blue-500 mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(acct.id)}
                          className="underline btn-delete"
                        >
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
    </div>
  );
};

export default AdminAccounts;
