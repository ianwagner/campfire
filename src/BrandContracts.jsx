import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';
import MonthSelector from './components/MonthSelector.jsx';
import { FiRefreshCw } from 'react-icons/fi';
import useUnsavedChanges from './useUnsavedChanges.js';

const emptyContract = {
  startDate: '',
  endDate: '',
  stills: '',
  videos: '',
  renews: false,
};

const inputClassName =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]';

const BrandContracts = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [contracts, setContracts] = useState([{ ...emptyContract }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!propId && !propCode) setBrandCode(brandCodes[0] || '');
  }, [brandCodes, propId, propCode]);

  useEffect(() => {
    const load = async () => {
      try {
        if (propId) {
          const snap = await getDoc(doc(db, 'brands', propId));
          if (snap.exists()) {
            setBrandId(propId);
            const data = snap.data();
            setBrandCode(data.code || propCode);
            setContracts(
              Array.isArray(data.contracts) && data.contracts.length
                ? data.contracts.map((c) => ({
                    startDate: c.startDate ? c.startDate.slice(0, 7) : '',
                    endDate: c.endDate ? c.endDate.slice(0, 7) : '',
                    stills: c.stills || '',
                    videos: c.videos || '',
                    renews: c.renews || false,
                  }))
                : [{ ...emptyContract }]
            );
          }
        } else if (brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            setBrandId(docData.id);
            const data = docData.data();
            setBrandCode(data.code || brandCode);
            setContracts(
              Array.isArray(data.contracts) && data.contracts.length
                ? data.contracts.map((c) => ({
                    startDate: c.startDate ? c.startDate.slice(0, 7) : '',
                    endDate: c.endDate ? c.endDate.slice(0, 7) : '',
                    stills: c.stills || '',
                    videos: c.videos || '',
                    renews: c.renews || false,
                  }))
                : [{ ...emptyContract }]
            );
          }
        }
        setDirty(false);
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [brandCode, propId, propCode]);

  const updateContract = (idx, changes) => {
    setContracts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...changes } : c)));
    setDirty(true);
  };

  const addContract = () => {
    setContracts((p) => [...p, { ...emptyContract }]);
    setDirty(true);
  };

  const removeContract = (idx) => {
    setContracts((p) => p.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    try {
      const normalized = contracts.map((c) => ({
        ...c,
        startDate: c.startDate ? c.startDate.slice(0, 7) : '',
        endDate: c.endDate ? c.endDate.slice(0, 7) : '',
      }));
      await setDoc(doc(db, 'brands', brandId), { contracts: normalized }, { merge: true });
      setContracts(normalized);
      setMessage('Contracts saved');
      setDirty(false);
    } catch (err) {
      console.error('Failed to save contracts', err);
      setMessage('Failed to save contracts');
    } finally {
      setLoading(false);
    }
  };

  useUnsavedChanges(dirty, handleSave);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Contract Overview</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Track deliverables, contract windows, and renewal cadence so the team always knows the latest terms.
            </p>
          </div>
          <SaveButton
            form="contracts-form"
            type="submit"
            canSave={dirty && !loading}
            loading={loading}
          />
        </div>

        <form id="contracts-form" onSubmit={handleSave} className="mt-6 space-y-5">
          {contracts.map((c, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm transition hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Start Month">
                  <MonthSelector
                    value={c.startDate}
                    onChange={(value) => updateContract(idx, { startDate: value })}
                    showButton={false}
                    className="w-full"
                    inputClassName={inputClassName}
                  />
                </FormField>
                <FormField label="End Month (optional)">
                  <MonthSelector
                    value={c.endDate}
                    onChange={(value) => updateContract(idx, { endDate: value })}
                    showButton={false}
                    className="w-full"
                    inputClassName={inputClassName}
                  />
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Number of Stills">
                  <input
                    type="number"
                    min="0"
                    value={c.stills}
                    onChange={(e) => updateContract(idx, { stills: e.target.value })}
                    className={inputClassName}
                  />
                </FormField>
                <FormField label="Number of Videos">
                  <input
                    type="number"
                    min="0"
                    value={c.videos}
                    onChange={(e) => updateContract(idx, { videos: e.target.value })}
                    className={inputClassName}
                  />
                </FormField>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => updateContract(idx, { renews: !c.renews })}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    c.renews
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-gray-200 text-gray-600 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]'
                  }`}
                >
                  <FiRefreshCw />
                  {c.renews ? 'Renews monthly' : 'Does not renew'}
                </button>
                <button
                  type="button"
                  onClick={() => removeContract(idx)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addContract}
              className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]"
            >
              Add Contract
            </button>
            {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
          </div>
        </form>
      </section>
    </div>
  );
};

export default BrandContracts;
