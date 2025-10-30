import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FiX } from 'react-icons/fi';
import { db, functions } from './firebase/config';
import debugLog from './utils/debugLog';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import Button from './components/Button.jsx';
import TabButton from './components/TabButton.jsx';
import BrandCodeSelector from './components/BrandCodeSelector.jsx';
import useAgencies from './useAgencies';

const getAccountName = (account) =>
  account.fullName || account.displayName || account.email || account.id;

const getAccountEmail = (account) => account.email || 'No email on file';

const formatRole = (role) => {
  if (!role) return '—';
  return role
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const isAccountAnonymous = (account) => {
  if (typeof account?.isAnonymous === 'boolean') {
    return account.isAnonymous;
  }
  if (typeof account?.anonymous === 'boolean') {
    return account.anonymous;
  }
  return !account?.email && !account?.fullName && !account?.displayName;
};

const AccountCard = ({ account, agencyName, onManage, onSignOut, onDelete }) => {
  const brandCodes = Array.isArray(account.brandCodes) ? account.brandCodes : [];
  const brandPreview = brandCodes.slice(0, 4);
  const remaining = brandCodes.length - brandPreview.length;
  const anonymous = isAccountAnonymous(account);

  return (
    <div className="group flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md focus-within:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-900 transition-colors group-hover:text-[var(--accent-color)] dark:text-gray-100 dark:group-hover:text-[var(--accent-color)]">
              {getAccountName(account)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{getAccountEmail(account)}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              anonymous
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100'
            }`}
          >
            {anonymous ? 'Anonymous' : 'Logged in'}
          </span>
        </div>
        <dl className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-start gap-2">
            <dt className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Role
            </dt>
            <dd className="flex-1">{formatRole(account.role)}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Audience
            </dt>
            <dd className="flex-1">{account.audience || '—'}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Agency
            </dt>
            <dd className="flex-1">{agencyName || account.agencyId || '—'}</dd>
          </div>
        </dl>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Brand codes</p>
          {brandCodes.length ? (
            <div className="flex flex-wrap gap-2">
              {brandPreview.map((code) => (
                <span
                  key={code}
                  className="rounded-full bg-[var(--accent-color-10)] px-3 py-1 text-xs font-medium text-[var(--accent-color)]"
                >
                  {code}
                </span>
              ))}
              {remaining > 0 && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  +{remaining} more
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No brand codes assigned.</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]">
        <div className="flex flex-wrap gap-2">
          <Button variant="neutral" size="sm" onClick={onManage}>
            Manage
          </Button>
          <Button variant="logout" size="sm" onClick={onSignOut}>
            Sign Out
          </Button>
        </div>
        <Button variant="delete" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
};

const AdminAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [accountView, setAccountView] = useState('logged-in');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [form, setForm] = useState({ role: 'client', brandCodes: [], audience: '', agencyId: '' });
  const [brands, setBrands] = useState([]);
  const { agencies } = useAgencies();

  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((agency) => [agency.id, agency.name])),
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
        setBrands(snap.docs.map((d) => d.data().code));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };

    fetchAccounts();
    fetchBrands();
  }, []);

  const openManageAccount = (account) => {
    setSelectedAccount(account);
    setForm({
      role: account.role || 'client',
      brandCodes: Array.isArray(account.brandCodes) ? account.brandCodes : [],
      audience: account.audience || '',
      agencyId: account.agencyId || '',
    });
  };

  const closeManageAccount = () => setSelectedAccount(null);

  const handleAddAllBrandCodes = () => {
    setForm((prev) => {
      const combined = new Set([
        ...prev.brandCodes,
        ...brands.filter((code) => Boolean(code)),
      ]);
      return { ...prev, brandCodes: Array.from(combined) };
    });
  };

  const handleSave = async () => {
    if (!selectedAccount) return;
    const id = selectedAccount.id;
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
        prev.map((account) =>
          account.id === id
            ? {
                ...account,
                role: form.role,
                brandCodes: codes,
                audience: form.audience,
                agencyId: form.agencyId || '',
              }
            : account
        )
      );
      setSelectedAccount((prev) =>
        prev && prev.id === id
          ? {
              ...prev,
              role: form.role,
              brandCodes: codes,
              audience: form.audience,
              agencyId: form.agencyId || '',
            }
          : prev
      );
      closeManageAccount();
    } catch (err) {
      console.error('Failed to update account', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this account?')) return;
    debugLog('Deleting account', id);
    try {
      await deleteDoc(doc(db, 'users', id));
      setAccounts((prev) => prev.filter((account) => account.id !== id));
      setSelectedAccount((prev) => (prev && prev.id === id ? null : prev));
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

  const term = filter.trim().toLowerCase();

  const displayAccounts = useMemo(() => {
    return accounts
      .filter((account) => {
        if (accountView === 'anonymous') return isAccountAnonymous(account);
        if (accountView === 'logged-in') return !isAccountAnonymous(account);
        return true;
      })
      .filter((account) => {
        if (!term) return true;
        const values = [
          account.fullName,
          account.displayName,
          account.email,
          account.id,
          account.role,
          account.audience,
          account.agencyId,
          agencyMap[account.agencyId],
        ];
        return values.some((value) =>
          value ? String(value).toLowerCase().includes(term) : false
        );
      })
      .sort((a, b) => {
        const nameA = getAccountName(a).toLowerCase();
        const nameB = getAccountName(b).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [accounts, accountView, term, agencyMap]);

  const hasFilter = Boolean(term);

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
                    Search every account, filter by access type, and manage roles, agencies, and brand access.
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
                left={
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search accounts"
                    aria-label="Search accounts"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                  />
                }
                right={
                  <div className="flex gap-2">
                    <TabButton
                      type="button"
                      active={accountView === 'logged-in'}
                      onClick={() => setAccountView('logged-in')}
                      className="text-sm"
                    >
                      Logged in
                    </TabButton>
                    <TabButton
                      type="button"
                      active={accountView === 'anonymous'}
                      onClick={() => setAccountView('anonymous')}
                      className="text-sm"
                    >
                      Anonymous
                    </TabButton>
                    <TabButton
                      type="button"
                      active={accountView === 'all'}
                      onClick={() => setAccountView('all')}
                      className="text-sm"
                    >
                      All
                    </TabButton>
                  </div>
                }
              />
              {loading ? (
                <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Loading accounts...
                </div>
              ) : displayAccounts.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      agencyName={agencyMap[account.agencyId]}
                      onManage={() => openManageAccount(account)}
                      onSignOut={() => handleSignOut(account.id)}
                      onDelete={() => handleDelete(account.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  {hasFilter ? (
                    <p className="mb-0">No accounts match “{filter.trim()}”. Try a different search term.</p>
                  ) : accountView === 'anonymous' ? (
                    <p className="mb-0">No anonymous accounts available.</p>
                  ) : accountView === 'logged-in' ? (
                    <p className="mb-0">No logged-in accounts available.</p>
                  ) : (
                    <p className="mb-0">No accounts created yet. Use the New Account button to add one.</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Manage account</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">{getAccountEmail(selectedAccount)}</p>
              </div>
              <button
                type="button"
                onClick={closeManageAccount}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:text-gray-300 dark:hover:bg-[var(--dark-sidebar-hover)]"
                aria-label="Close account management"
              >
                <FiX />
              </button>
            </div>
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Role
                  </span>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                  >
                    <option value="client">Client</option>
                    <option value="designer">Designer</option>
                    <option value="manager">Manager</option>
                    <option value="project-manager">Project Manager</option>
                    <option value="ops">Ops</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Audience
                  </span>
                  <input
                    type="text"
                    value={form.audience}
                    onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                  />
                </label>
              </div>
              <label className="space-y-2 text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Agency
                </span>
                <select
                  value={form.agencyId}
                  onChange={(e) => setForm((prev) => ({ ...prev, agencyId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                >
                  <option value="">Select agency</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2 text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Brand codes
                </span>
                <BrandCodeSelector
                  id={`brand-codes-${selectedAccount.id}`}
                  value={form.brandCodes}
                  onChange={(brandCodes) => setForm((prev) => ({ ...prev, brandCodes }))}
                  suggestions={brands}
                  onAddAll={handleAddAllBrandCodes}
                />
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-[var(--border-color-default)]">
              <div className="flex flex-wrap gap-2">
                <Button variant="logout" size="sm" onClick={() => handleSignOut(selectedAccount.id)}>
                  Sign Out
                </Button>
                <Button variant="delete" size="sm" onClick={() => handleDelete(selectedAccount.id)}>
                  Delete account
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="neutral" size="sm" onClick={closeManageAccount}>
                  Cancel
                </Button>
                <Button variant="accent" size="sm" onClick={handleSave}>
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccounts;
