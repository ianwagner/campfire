import React, { useEffect, useState } from 'react';
import { FiEye, FiEdit2, FiTrash, FiLogOut } from 'react-icons/fi';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, functions } from './firebase/config';
import { httpsCallable } from 'firebase/functions';
import debugLog from './utils/debugLog';
import TagInput from './components/TagInput.jsx';

const AdminAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ role: 'client', brandCodes: [] });
  const [brands, setBrands] = useState([]);
  const [viewAcct, setViewAcct] = useState(null);

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

    const fetchBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrands(snap.docs.map((d) => d.data().code));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };

    fetchAccounts();
    fetchBrands();
  }, []);

  const startEdit = (acct) => {
    setEditId(acct.id);
    setForm({
      role: acct.role || 'client',
      brandCodes: Array.isArray(acct.brandCodes) ? acct.brandCodes : [],
    });
  };

  const cancelEdit = () => setEditId(null);

  const handleSave = async (id) => {
    debugLog('Saving account', id);
    const codes = form.brandCodes.filter(Boolean);
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
    debugLog('Deleting account', id);
    try {
      await deleteDoc(doc(db, 'users', id));
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete account', err);
    }
  };

  const handleSignOut = async (id) => {
    if (!window.confirm('Sign this user out?')) return;
    debugLog('Signing out user', id);
    try {
      const callable = httpsCallable(functions, 'signOutUser');
      await callable({ uid: id });
    } catch (err) {
      console.error('Failed to sign out user', err);
    }
  };

  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Accounts</h1>
        <a href="/admin/accounts/new" className="underline text-gray-700 block mb-2">Add Account</a>
        {loading ? (
          <p>Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p>No accounts found.</p>
        ) : (
          <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Brand Codes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acct) => (
                <tr key={acct.id}>
                  <td>{acct.fullName || acct.email || acct.id}</td>
                  <td>
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
                  <td>
                    {editId === acct.id ? (
                      <TagInput
                        value={form.brandCodes}
                        onChange={(codes) => setForm((f) => ({ ...f, brandCodes: codes }))}
                        suggestions={brands}
                        id={`brand-${acct.id}`}
                      />
                    ) : Array.isArray(acct.brandCodes) ? (
                      acct.brandCodes.join(', ')
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="text-center">
                    {editId === acct.id ? (
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleSave(acct.id)}
                          className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="btn-secondary px-1.5 py-0.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setViewAcct(acct)}
                          className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                          aria-label="View"
                        >
                          <FiEye />
                          <span className="ml-1">View</span>
                        </button>
                        <button
                          onClick={() => startEdit(acct)}
                          className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                          aria-label="Edit"
                        >
                          <FiEdit2 />
                          <span className="ml-1">Edit</span>
                        </button>
                        <button
                          onClick={() => handleSignOut(acct.id)}
                          className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                          aria-label="Sign Out"
                        >
                          <FiLogOut />
                          <span className="ml-1">Sign Out</span>
                        </button>
                        <button
                          onClick={() => handleDelete(acct.id)}
                          className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 btn-delete"
                          aria-label="Delete"
                        >
                          <FiTrash />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      {viewAcct && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <h3 className="mb-2 font-semibold">{viewAcct.fullName || viewAcct.email || viewAcct.id}</h3>
            <p className="text-sm mb-1">Email: {viewAcct.email || 'N/A'}</p>
            <p className="text-sm mb-1">Role: {viewAcct.role}</p>
            {Array.isArray(viewAcct.brandCodes) && viewAcct.brandCodes.length > 0 && (
              <p className="text-sm mb-1">Brands: {viewAcct.brandCodes.join(', ')}</p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleSignOut(viewAcct.id)}
                className="btn-secondary px-3 py-1 flex items-center gap-1"
              >
                <FiLogOut />
                <span>Sign Out</span>
              </button>
              <button onClick={() => setViewAcct(null)} className="btn-primary px-3 py-1">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccounts;
