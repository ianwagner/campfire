import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEye, FiEdit2, FiTrash, FiLogOut, FiPlus } from 'react-icons/fi';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, functions } from './firebase/config';
import { httpsCallable } from 'firebase/functions';
import debugLog from './utils/debugLog';
import TagInput from './components/TagInput.jsx';
import Table from './components/common/Table';

const AdminAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('name');
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ role: 'client', brandCodes: [], audience: '' });
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
      audience: acct.audience || '',
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
        audience: form.audience,
      });
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, role: form.role, brandCodes: codes, audience: form.audience }
            : a
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

  const term = filter.toLowerCase();
  const displayAccounts = accounts
    .filter(
      (a) =>
        !term ||
        a.fullName?.toLowerCase().includes(term) ||
        a.email?.toLowerCase().includes(term)
    )
    .sort((a, b) => {
      if (sortField === 'role') return (a.role || '').localeCompare(b.role || '');
      if (sortField === 'email') return (a.email || '').localeCompare(b.email || '');
      return (a.fullName || '').localeCompare(b.fullName || '');
    });

  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Accounts</h1>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <Link to="/admin/accounts/new" className="btn-primary flex items-center gap-1">
            <FiPlus />
            Create Account
          </Link>
          <div className="flex items-center gap-2">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="p-1 border rounded"
            >
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="role">Role</option>
            </select>
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="p-1 border rounded"
            />
          </div>
        </div>
        {loading ? (
          <p>Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p>No accounts found.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Audience</th>
                <th>Brand Codes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayAccounts.map((acct) => (
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
                      <input
                        type="text"
                        value={form.audience}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, audience: e.target.value }))
                        }
                        className="w-full p-1 border rounded"
                      />
                    ) : (
                      acct.audience || ''
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
                          className="btn-action mr-2"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="btn-action"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setViewAcct(acct)}
                          className="btn-action mr-2"
                          aria-label="View"
                        >
                          <FiEye />
                          <span className="ml-1">View</span>
                        </button>
                        <button
                          onClick={() => startEdit(acct)}
                          className="btn-action mr-2"
                          aria-label="Edit"
                        >
                          <FiEdit2 />
                          <span className="ml-1">Edit</span>
                        </button>
                        <button
                          onClick={() => handleSignOut(acct.id)}
                          className="btn-action mr-2"
                          aria-label="Sign Out"
                        >
                          <FiLogOut />
                          <span className="ml-1">Sign Out</span>
                        </button>
                        <button
                          onClick={() => handleDelete(acct.id)}
                          className="btn-action btn-delete"
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
          </Table>
        )}
      {viewAcct && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <h3 className="mb-2 font-semibold">{viewAcct.fullName || viewAcct.email || viewAcct.id}</h3>
            <p className="text-sm mb-1">Email: {viewAcct.email || 'N/A'}</p>
            <p className="text-sm mb-1">Role: {viewAcct.role}</p>
            {viewAcct.audience && (
              <p className="text-sm mb-1">Audience: {viewAcct.audience}</p>
            )}
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
