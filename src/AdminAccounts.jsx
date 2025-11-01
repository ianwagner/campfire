import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FiEye, FiEdit2, FiTrash, FiLogOut, FiUserCheck, FiUserX } from 'react-icons/fi';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, functions } from './firebase/config';
import { httpsCallable } from 'firebase/functions';
import debugLog from './utils/debugLog';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import SortButton from './components/SortButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import Button from './components/Button.jsx';
import useAgencies from './useAgencies';
import TabButton from './components/TabButton.jsx';
import BrandCodeSelectionModal from './components/BrandCodeSelectionModal.jsx';

const AdminAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('name');
  const [userType, setUserType] = useState('registered');
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ role: 'client', brandCodes: [], audience: '', agencyId: '' });
  const [brands, setBrands] = useState([]);
  const [viewAcct, setViewAcct] = useState(null);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const { agencies } = useAgencies();
  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((a) => [a.id, a.name])),
    [agencies]
  );

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
        const codes = snap.docs
          .map((d) => d.data().code)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        setBrands(codes);
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };

    fetchAccounts();
    fetchBrands();
  }, []);

  const isAnonymousAccount = useCallback((acct) => {
    if (typeof acct?.isAnonymous === 'boolean') return acct.isAnonymous;
    if (typeof acct?.anonymous === 'boolean') return acct.anonymous;
    if (typeof acct?.userType === 'string') return acct.userType === 'anonymous';
    if (typeof acct?.provider === 'string') return acct.provider === 'anonymous';
    return !acct?.email;
  }, []);

  const startEdit = (acct) => {
    setEditId(acct.id);
    setBrandModalOpen(false);
    setForm({
      role: acct.role || 'client',
      brandCodes: Array.isArray(acct.brandCodes) ? acct.brandCodes : [],
      audience: acct.audience || '',
      agencyId: acct.agencyId || '',
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setBrandModalOpen(false);
  };

  const handleSave = async (id) => {
    debugLog('Saving account', id);
    const codes = form.brandCodes.filter(Boolean);
    if (form.role === 'ops' && !form.agencyId) {
      window.alert('Ops users require an agency');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', id), {
        role: form.role,
        brandCodes: codes,
        audience: form.audience,
        agencyId: form.agencyId || '',
      });
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, role: form.role, brandCodes: codes, audience: form.audience, agencyId: form.agencyId || '' }
            : a
        )
      );
      setEditId(null);
      setBrandModalOpen(false);
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

  const displayAccounts = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return [...accounts]
      .filter((acct) => {
        const isAnon = isAnonymousAccount(acct);
        if (userType === 'anonymous' && !isAnon) return false;
        if (userType === 'registered' && isAnon) return false;
        if (!term) return true;
        const haystacks = [acct.fullName, acct.email, acct.id, acct.audience, acct.role];
        return haystacks.some((value) =>
          value ? String(value).toLowerCase().includes(term) : false
        );
      })
      .sort((a, b) => {
        if (sortField === 'role') return (a.role || '').localeCompare(b.role || '');
        if (sortField === 'email') return (a.email || '').localeCompare(b.email || '');
        if (sortField === 'name') {
          const nameA = (a.fullName || a.email || '').toLowerCase();
          const nameB = (b.fullName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        }
        return 0;
      });
  }, [accounts, filter, isAnonymousAccount, sortField, userType]);

  const hasFilters = Boolean(filter.trim());
  const viewingAnonymous = userType === 'anonymous';
  const accountTypeLabel = viewingAnonymous ? 'anonymous users' : 'registered users';

  const handleToggleType = (type) => {
    setUserType(type);
    setEditId(null);
    setBrandModalOpen(false);
  };

  const brandDisplay = (codes) => {
    const list = (Array.isArray(codes) ? codes.filter(Boolean) : []).sort((a, b) => a.localeCompare(b));
    const visible = list.slice(0, 6);
    const remainder = list.length - visible.length;
    if (list.length === 0) {
      return <span className="text-sm text-gray-400 dark:text-gray-500">No brand codes</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {visible.map((code) => (
          <span
            key={code}
            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200"
          >
            {code}
          </span>
        ))}
        {remainder > 0 && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-300">+{remainder} more</span>
        )}
      </div>
    );
  };

  const extractAnonymousDetails = (acct) => {
    const details = {
      providedNames: [],
      lastBrand: null,
      visitedBrands: [],
    };

    const nameKeys = [
      'providedName',
      'guestName',
      'submittedName',
      'tempName',
      'temporaryName',
      'anonName',
      'anonymousName',
      'displayName',
      'name',
    ];
    const brandKeys = [
      'brandCode',
      'brand',
      'lastBrand',
      'lastBrandCode',
      'recentBrandCodes',
      'recentBrands',
      'brandHistory',
      'accessedBrand',
      'accessedBrands',
    ];

    const visitedSet = new Set();
    const providedNameSet = new Set();

    const inspectObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      nameKeys.forEach((key) => {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) {
          providedNameSet.add(value.trim());
        }
      });
      brandKeys.forEach((key) => {
        const value = obj[key];
        if (!value) return;
        if (Array.isArray(value)) {
          value
            .map((v) => (typeof v === 'string' ? v.trim() : null))
            .filter(Boolean)
            .forEach((v) => visitedSet.add(v));
        } else if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return;
          if (!details.lastBrand) details.lastBrand = trimmed;
          visitedSet.add(trimmed);
        }
      });
    };

    inspectObject(acct);
    inspectObject(acct?.anonymousMetadata);
    inspectObject(acct?.metadata);
    inspectObject(acct?.profile);

    details.providedNames = Array.from(providedNameSet).filter((name) => name !== acct.fullName);
    details.visitedBrands = Array.from(visitedSet);
    if (!details.lastBrand && details.visitedBrands.length > 0) {
      details.lastBrand = details.visitedBrands[0];
    }

    return details;
  };

  const openBrandModal = () => setBrandModalOpen(true);
  const closeBrandModal = () => setBrandModalOpen(false);
  const applyBrandSelection = (codes) => {
    setForm((f) => ({
      ...f,
      brandCodes: codes,
    }));
    closeBrandModal();
  };

  const viewAnonymousDetails = viewAcct && isAnonymousAccount(viewAcct) ? extractAnonymousDetails(viewAcct) : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Account Directory</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Browse {accountTypeLabel}, search quickly, and manage access, agencies, and brand permissions.
                  </p>
                </div>
                <CreateButton
                  as={Link}
                  to="/admin/accounts/new"
                  ariaLabel="Create account"
                  className="self-start"
                >
                  <span className="hidden sm:inline">New Account</span>
                </CreateButton>
              </div>
              <PageToolbar
                left={(
                  <>
                    <input
                      type="search"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Search accounts"
                      aria-label="Search accounts"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                    />
                    <SortButton
                      value={sortField}
                      onChange={setSortField}
                      options={[
                        { value: 'name', label: 'Name' },
                        { value: 'email', label: 'Email' },
                        { value: 'role', label: 'Role' },
                      ]}
                    />
                  </>
                )}
                right={(
                  <div className="flex items-center gap-2">
                    <TabButton
                      type="button"
                      active={userType === 'registered'}
                      onClick={() => handleToggleType('registered')}
                      aria-pressed={userType === 'registered'}
                    >
                      <FiUserCheck />
                      <span className="hidden sm:inline">Registered</span>
                    </TabButton>
                    <TabButton
                      type="button"
                      active={userType === 'anonymous'}
                      onClick={() => handleToggleType('anonymous')}
                      aria-pressed={userType === 'anonymous'}
                    >
                      <FiUserX />
                      <span className="hidden sm:inline">Anonymous</span>
                    </TabButton>
                  </div>
                )}
              />
              {loading ? (
                <div className="flex justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-400">
                  Loading accounts...
                </div>
              ) : displayAccounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  {hasFilters ? (
                    <p className="mb-0">No {accountTypeLabel} match “{filter.trim()}”. Try a different search.</p>
                  ) : (
                    <p className="mb-0">No {accountTypeLabel} found yet.</p>
                  )}
                </div>
              ) : (
                <Table columns={["2.6fr", "1.3fr", "1.8fr", "2.6fr", "140px"]}>
                  <thead>
                    <tr>
                      <th className="text-left">Account</th>
                      <th className="text-left">Role</th>
                      <th className="text-left">Agency</th>
                      <th className="text-left">Brand Codes</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayAccounts.map((acct) => {
                      const isAnon = isAnonymousAccount(acct);
                      const isEditing = editId === acct.id;
                      const anonymousDetails = extractAnonymousDetails(acct);
                      return (
                        <tr key={acct.id} className="align-top">
                          <td>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {acct.fullName || acct.email || acct.id}
                                </span>
                                {isAnon && (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                                    Anonymous
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{acct.email || 'No email on file'}</p>
                              {acct.audience && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">Audience: {acct.audience}</p>
                              )}
                              {isAnon && (
                                <div className="space-y-0.5">
                                  {anonymousDetails.providedNames.length > 0 && (
                                    <p className="text-xs text-amber-600 dark:text-amber-300">
                                      Provided name: {anonymousDetails.providedNames.join(', ')}
                                    </p>
                                  )}
                                  {anonymousDetails.lastBrand && (
                                    <p className="text-xs text-amber-600 dark:text-amber-300">
                                      Last visited brand: {anonymousDetails.lastBrand}
                                    </p>
                                  )}
                                  {anonymousDetails.visitedBrands.length > 1 && (
                                    <p className="text-xs text-amber-600 dark:text-amber-300">
                                      Other visits: {anonymousDetails.visitedBrands.slice(1).join(', ')}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            {isEditing && (
                              <div className="mt-3 space-y-1">
                                <label htmlFor={`audience-${acct.id}`} className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                  Audience
                                </label>
                                <input
                                  id={`audience-${acct.id}`}
                                  type="text"
                                  value={form.audience}
                                  onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200"
                                />
                              </div>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                value={form.role}
                                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200"
                              >
                                <option value="client">Client</option>
                                <option value="designer">Designer</option>
                                <option value="manager">Manager</option>
                                <option value="project-manager">Project Manager</option>
                                <option value="ops">Ops</option>
                                <option value="editor">Editor</option>
                                <option value="admin">Admin</option>
                              </select>
                            ) : (
                              <span className="text-sm text-gray-700 dark:text-gray-200">{acct.role || '—'}</span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                value={form.agencyId}
                                onChange={(e) => setForm((f) => ({ ...f, agencyId: e.target.value }))}
                                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200"
                              >
                                <option value="">Select agency</option>
                                {agencies.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-700 dark:text-gray-200">
                                {agencyMap[acct.agencyId] || acct.agencyId || '—'}
                              </span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                    Brand access
                                  </span>
                                  <Button type="button" variant="neutral" size="sm" onClick={openBrandModal}>
                                    Manage brands
                                  </Button>
                                </div>
                                {brandDisplay(form.brandCodes)}
                              </div>
                            ) : (
                              brandDisplay(acct.brandCodes)
                            )}
                          </td>
                          <td className="text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-2">
                                <Button variant="accent" size="sm" onClick={() => handleSave(acct.id)}>
                                  Save
                                </Button>
                                <Button variant="neutral" size="sm" onClick={cancelEdit}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <IconButton onClick={() => setViewAcct(acct)} aria-label="View">
                                  <FiEye />
                                </IconButton>
                                {!isAnon && (
                                  <IconButton onClick={() => startEdit(acct)} aria-label="Edit">
                                    <FiEdit2 />
                                  </IconButton>
                                )}
                                <IconButton onClick={() => handleSignOut(acct.id)} aria-label="Sign Out">
                                  <FiLogOut />
                                </IconButton>
                                <IconButton
                                  onClick={() => handleDelete(acct.id)}
                                  aria-label="Delete"
                                >
                                  <FiTrash />
                                </IconButton>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </div>
          </section>
        </div>
      </div>
      <BrandCodeSelectionModal
        open={brandModalOpen}
        brands={brands}
        selected={form.brandCodes}
        onApply={applyBrandSelection}
        onClose={closeBrandModal}
        title="Manage brand access"
        description="Search, sort, and select which brand codes this account can access."
        emptyMessage="No brand codes match your search."
        applyLabel="Apply selection"
      />
      {viewAcct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-w-sm rounded-xl bg-white p-4 shadow dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <h3 className="mb-2 font-semibold">{viewAcct.fullName || viewAcct.email || viewAcct.id}</h3>
            <p className="mb-1 text-sm">Email: {viewAcct.email || 'N/A'}</p>
            <p className="mb-1 text-sm">Role: {viewAcct.role || '—'}</p>
            {isAnonymousAccount(viewAcct) && viewAnonymousDetails && (
              <div className="mb-1 space-y-1 text-sm text-amber-600 dark:text-amber-300">
                <p className="mb-0">Anonymous session</p>
                {viewAnonymousDetails.providedNames.length > 0 && (
                  <p className="mb-0">Provided name: {viewAnonymousDetails.providedNames.join(', ')}</p>
                )}
                {viewAnonymousDetails.lastBrand && (
                  <p className="mb-0">Last visited brand: {viewAnonymousDetails.lastBrand}</p>
                )}
                {viewAnonymousDetails.visitedBrands.length > 1 && (
                  <p className="mb-0">
                    Other visits: {viewAnonymousDetails.visitedBrands.slice(1).join(', ')}
                  </p>
                )}
              </div>
            )}
            {viewAcct.audience && (
              <p className="mb-1 text-sm">Audience: {viewAcct.audience}</p>
            )}
            {viewAcct.agencyId && (
              <p className="mb-1 text-sm">Agency: {agencyMap[viewAcct.agencyId] || viewAcct.agencyId}</p>
            )}
            {Array.isArray(viewAcct.brandCodes) && viewAcct.brandCodes.length > 0 && (
              <p className="mb-1 text-sm">
                Brands: {viewAcct.brandCodes.filter(Boolean).sort((a, b) => a.localeCompare(b)).join(', ')}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => handleSignOut(viewAcct.id)}
                className="btn-secondary flex items-center gap-1 px-3 py-1"
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
