import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase/config';

const getUserDisplayName = (user) => {
  if (!user) return '';
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name) return name;
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  if (displayName) return displayName;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email) return email;
  const phoneNumber = typeof user.phoneNumber === 'string' ? user.phoneNumber.trim() : '';
  if (phoneNumber) return phoneNumber;
  return user.id || '';
};

const BrandStaffAssignment = ({ brandId, brand = null, onBrandUpdate = null }) => {
  const [designerId, setDesignerId] = useState('');
  const [editorId, setEditorId] = useState('');
  const [designers, setDesigners] = useState([]);
  const [editors, setEditors] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const originalDesignerId = useMemo(
    () => (typeof brand?.defaultDesignerId === 'string' ? brand.defaultDesignerId : ''),
    [brand?.defaultDesignerId],
  );

  const originalEditorId = useMemo(
    () => (typeof brand?.defaultEditorId === 'string' ? brand.defaultEditorId : ''),
    [brand?.defaultEditorId],
  );

  useEffect(() => {
    setDesignerId(originalDesignerId);
  }, [originalDesignerId]);

  useEffect(() => {
    setEditorId(originalEditorId);
  }, [originalEditorId]);

  useEffect(() => {
    if (!brandId) {
      setDesigners([]);
      setEditors([]);
      setLoadingStaff(false);
      return;
    }
    let active = true;
    const loadStaff = async () => {
      setLoadingStaff(true);
      try {
        const [designerSnap, editorSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'designer'))),
          getDocs(query(collection(db, 'users'), where('role', '==', 'editor'))),
        ]);
        if (!active) return;
        const designerList = designerSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const editorList = editorSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        designerList.sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
        editorList.sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
        setDesigners(designerList);
        setEditors(editorList);
      } catch (err) {
        console.error('Failed to load staff for brand assignment', err);
        if (active) {
          setDesigners([]);
          setEditors([]);
          setError('Failed to load staff. Please refresh and try again.');
        }
      } finally {
        if (active) setLoadingStaff(false);
      }
    };
    loadStaff();
    return () => {
      active = false;
    };
  }, [brandId]);

  const normalizedDesignerId = designerId || '';
  const normalizedEditorId = editorId || '';
  const hasChanges =
    normalizedDesignerId !== originalDesignerId || normalizedEditorId !== originalEditorId;

  const handleSave = async () => {
    if (!brandId || !hasChanges) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await updateDoc(doc(db, 'brands', brandId), {
        defaultDesignerId: normalizedDesignerId || null,
        defaultEditorId: normalizedEditorId || null,
      });
      setMessage('Staff assignments updated.');
      if (typeof onBrandUpdate === 'function') {
        onBrandUpdate((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            defaultDesignerId: normalizedDesignerId || null,
            defaultEditorId: normalizedEditorId || null,
          };
        });
      }
    } catch (err) {
      console.error('Failed to update staff assignments', err);
      setError('Failed to update staff assignments. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Staff assignment</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Select the default editor and designer for this brand. Future ad groups will automatically
          use these assignments, and you can still adjust them per project if needed.
        </p>
      </div>
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-200">
          <span className="font-medium">Default designer</span>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-100"
            value={normalizedDesignerId}
            onChange={(event) => {
              setDesignerId(event.target.value);
              setMessage('');
              setError('');
            }}
            disabled={loadingStaff || saving}
          >
            <option value="">Unassigned</option>
            {designers.map((user) => (
              <option key={user.id} value={user.id}>
                {getUserDisplayName(user)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-200">
          <span className="font-medium">Default editor</span>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-100"
            value={normalizedEditorId}
            onChange={(event) => {
              setEditorId(event.target.value);
              setMessage('');
              setError('');
            }}
            disabled={loadingStaff || saving}
          >
            <option value="">Unassigned</option>
            {editors.map((user) => (
              <option key={user.id} value={user.id}>
                {getUserDisplayName(user)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
        {loadingStaff ? <span>Loading available staff…</span> : <span>Select “Unassigned” to clear an assignment.</span>}
        <button
          type="button"
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
          onClick={handleSave}
          disabled={saving || loadingStaff || !hasChanges}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
};

export default BrandStaffAssignment;
