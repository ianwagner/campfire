import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FiTrash,
  FiLink,
  FiImage,
  FiFolderPlus,
  FiTag,
  FiList,
  FiGrid,
  FiDownload,
  FiSearch,
} from 'react-icons/fi';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import SaveButton from './components/SaveButton.jsx';
import LoadingIconButton from './components/LoadingIconButton.jsx';
import SortButton from './components/SortButton.jsx';
import HoverPreview from './components/HoverPreview.jsx';
import TaggerModal from './TaggerModal.jsx';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';
import { collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';

import syncAssetLibrary from './utils/syncAssetLibrary';
import useUnsavedChanges from './useUnsavedChanges.js';

const emptyAsset = {
  id: '',
  name: '',
  url: '',
  type: '',
  description: '',
  product: '',
  campaign: '',
  thumbnailUrl: '',
  createdAt: null,
};

const sortFn = (field) => (a, b) => {
  if (field === 'createdAt') return (b.createdAt || 0) - (a.createdAt || 0);
  if (field === 'type') return (a.type || '').localeCompare(b.type || '');
  if (field === 'product') return (a.product || '').localeCompare(b.product || '');
  if (field === 'campaign') return (a.campaign || '').localeCompare(b.campaign || '');
  return (a.name || '').localeCompare(b.name || '');
};

const AssetLibrary = ({ brandCode = '' }) => {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState({});
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [bulkValues, setBulkValues] = useState({ type: '', product: '', campaign: '' });
  const [loading, setLoading] = useState(false);
  const [showTagger, setShowTagger] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('list');
  const [products, setProducts] = useState([]);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE);
  const [thumbMissingLoading, setThumbMissingLoading] = useState(false);
  const [tagMissingLoading, setTagMissingLoading] = useState(false);
  const [thumbSelectedLoading, setThumbSelectedLoading] = useState(false);
  const [tagSelectedLoading, setTagSelectedLoading] = useState(false);

  // keep assets sorted whenever the sort field changes
  useEffect(() => {
    setAssets((prev) => {
      const arr = [...prev];
      arr.sort(sortFn(sortField));
      return arr;
    });
  }, [sortField]);

  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return assets.filter(
      (a) =>
        !term ||
        (a.name || '').toLowerCase().includes(term) ||
        (a.product || '').toLowerCase().includes(term) ||
        (a.campaign || '').toLowerCase().includes(term)
    );
  }, [assets, filter]);

  const lastIdx = useRef(null);
  const dragValue = useRef(null);
  const dragField = useRef(null);
  const galleryRef = useRef(null);

  const updateSpans = () => {
    if (typeof window === 'undefined') return;
    const gallery = galleryRef.current;
    if (!gallery) return;
    const rowHeight = parseInt(
      window.getComputedStyle(gallery).getPropertyValue('grid-auto-rows')
    );
    const rowGap = parseInt(
      window.getComputedStyle(gallery).getPropertyValue('row-gap')
    );
    Array.from(gallery.children).forEach((child) => {
      const img = child.querySelector('img');
      if (img) {
        const h = img.getBoundingClientRect().height;
        const span = Math.ceil((h + rowGap) / (rowHeight + rowGap));
        child.style.gridRowEnd = `span ${span}`;
      }
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let q = collection(db, 'adAssets');
        if (brandCode) q = query(q, where('brandCode', '==', brandCode));
        const snap = await getDocs(q);
        if (!cancelled) {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          docs.sort(sortFn(sortField));
          setAssets(docs);
          setDirty(false);
        }
      } catch (err) {
        console.error('Failed to load asset library', err);
      }
    };

    load();
    const up = () => {
      dragValue.current = null;
      dragField.current = null;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', up);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('mouseup', up);
      }
    };
  }, [brandCode]);

  useEffect(() => {
    const loadProducts = async () => {
      if (!brandCode) {
        setProducts([]);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const prods = Array.isArray(data.products) ? data.products : [];
          setProducts(prods.map((p) => p.name).filter(Boolean));
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.error('Failed to load products', err);
        setProducts([]);
      }
    };
    loadProducts();
  }, [brandCode]);

  useEffect(() => {
    setPage(0);
    setRowsPerPage(PAGE_SIZE);
  }, [filter]);

  useEffect(() => {
    setRowsPerPage(PAGE_SIZE);
  }, [page]);

  useEffect(() => {
    if (view === 'gallery') {
      updateSpans();
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', updateSpans);
        return () => window.removeEventListener('resize', updateSpans);
      }
    }
    return undefined;
  }, [view, filtered]);

  const updateRow = (id, field, value) => {
    setAssets((p) => p.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
    setDirty(true);
  };

  const deleteSelected = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    setAssets((p) => p.filter((a) => !ids.includes(a.id)));
    setSelected({});
    setDirty(true);
  };

  const deleteRow = (id) => {
    setAssets((p) => p.filter((a) => a.id !== id));
    setSelected((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setDirty(true);
  };

  const bulkEdit = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    setAssets((p) =>
      p.map((a) =>
        ids.includes(a.id)
          ? { ...a, ...Object.fromEntries(Object.entries(bulkValues).filter(([_, v]) => v !== '')) }
          : a
      )
    );
    setBulkValues({ type: '', product: '', campaign: '' });
    setDirty(true);
  };

  const createThumbnails = async () => {
    const rows = assets.filter((a) => selected[a.id]);
    if (rows.length === 0) return;
    setLoading(true);
    setThumbSelectedLoading(true);
    try {
      const callable = httpsCallable(functions, 'generateThumbnailsForAssets', { timeout: 60000 });
      const payload = rows.map((r) => ({ url: r.url, name: r.name }));
      const res = await callable({ assets: payload });
      const results = res.data?.results || [];
      setAssets((prev) =>
        prev.map((a) => {
          const match = results.find((r) => r.name === a.name);
          return match && match.thumbnailUrl ? { ...a, thumbnailUrl: match.thumbnailUrl } : a;
        })
      );
      setDirty(true);
    } catch (err) {
      console.error('Failed to generate thumbnails', err);
    }
    setLoading(false);
    setThumbSelectedLoading(false);
  };

  const createMissingThumbnails = async () => {
    const rows = assets.filter((a) => !a.thumbnailUrl && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    setThumbMissingLoading(true);
    const callable = httpsCallable(functions, 'generateThumbnailsForAssets', { timeout: 60000 });
    for (const row of rows) {
      try {
        const res = await callable({ assets: [{ url: row.url, name: row.name }] });
        const result = res.data?.results?.[0];
        if (result?.thumbnailUrl) {
          setAssets((prev) =>
            prev.map((a) => (a.id === row.id ? { ...a, thumbnailUrl: result.thumbnailUrl } : a))
          );
        }
      } catch (err) {
        console.error('Failed to generate thumbnail', err);
      }
    }
    setLoading(false);
    setThumbMissingLoading(false);
    setDirty(true);
  };

  const tagRow = async (row) => {
    const callable = httpsCallable(functions, 'generateTagsForAssets', { timeout: 300000 });
    try {
      const res = await callable({ assets: [{ url: row.url, name: row.name }] });
      const result = res.data?.results?.[0];
      if (result) {
        setAssets((prev) =>
          prev.map((a) =>
            a.id === row.id
              ? { ...a, type: a.type || result.type, description: a.description || result.description }
              : a
          )
        );
        setDirty(true);
      }
    } catch (err) {
      console.error('Failed to tag asset', err);
    }
  };

  const tagSelected = async () => {
    const rows = assets.filter((a) => selected[a.id] && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    setTagSelectedLoading(true);
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await tagRow(row);
    }
    setLoading(false);
    setTagSelectedLoading(false);
    setDirty(true);
  };

  const tagMissing = async () => {
    const rows = assets.filter((a) => (!a.type || !a.description) && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    setTagMissingLoading(true);
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await tagRow(row);
    }
    setLoading(false);
    setTagMissingLoading(false);
    setDirty(true);
  };

  const saveAssets = async () => {
    try {
      setSaving(true);
      await syncAssetLibrary(brandCode, assets);
      setAssets((prev) => {
        const arr = [...prev];
        arr.sort(sortFn(sortField));
        return arr;
      });
      setDirty(false);
    } catch (err) {
      console.error('Failed to save assets', err);
    } finally {
      setSaving(false);
    }
  };


  const handleCheckChange = (e, idx, id) => {
    const checked = e.target.checked;
    if (e.shiftKey && lastIdx.current !== null) {
      const start = Math.min(lastIdx.current, idx);
      const end = Math.max(lastIdx.current, idx);
      const ids = filtered.slice(start, end + 1).map((a) => a.id);
      setSelected((p) => {
        const next = { ...p };
        ids.forEach((rid) => {
          next[rid] = checked;
        });
        return next;
      });
    } else {
      setSelected((p) => ({ ...p, [id]: checked }));
      lastIdx.current = idx;
    }
  };

  const handleInputDown = (field, value) => (e) => {
    if (e.altKey) {
      dragValue.current = value;
      dragField.current = field;
    }
  };

  const handleInputOver = (id) => (e) => {
    if (dragValue.current !== null && dragField.current) {
      updateRow(id, dragField.current, dragValue.current);
    }
  };


  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const startIdx = page * PAGE_SIZE;
  const visible = filtered.slice(startIdx, startIdx + rowsPerPage);
  const canShowMore = startIdx + rowsPerPage < Math.min(filtered.length, (page + 1) * PAGE_SIZE);

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  const { totalAssets, visibleAssets, assetsWithThumbs } = useMemo(() => {
    const withThumbs = assets.filter((a) => a.thumbnailUrl).length;
    return {
      totalAssets: assets.length,
      visibleAssets: filtered.length,
      assetsWithThumbs: withThumbs,
    };
  }, [assets, filtered]);

  const hasFilter = filter.trim().length > 0;
  const hasSelection = selectedCount > 0;

  useUnsavedChanges(dirty, saveAssets);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent-color-10)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent-color)]">
              Asset Hub
            </span>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Asset Library</h2>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                Keep every production-ready asset aligned with your brand guardrails. Generate thumbnails, auto-tag files, and
                organise them by product or campaign from a single workspace.
              </p>
            </div>
            {hasSelection ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-color-10)] px-3 py-1 text-xs font-medium text-[var(--accent-color)]">
                {selectedCount} asset{selectedCount === 1 ? '' : 's'} selected
              </span>
            ) : null}
          </div>
          <dl className="grid w-full gap-3 text-sm sm:grid-cols-3 lg:w-auto">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-700 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total assets</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{totalAssets}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-700 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Visible now</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{visibleAssets}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-700 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Thumbnails ready</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{assetsWithThumbs}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3">
              <div className="relative w-full md:w-72">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search assets, products, or campaigns..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Sort</span>
                <SortButton
                  value={sortField}
                  onChange={setSortField}
                  options={[
                    { value: 'createdAt', label: 'Date Added' },
                    { value: 'name', label: 'Name' },
                    { value: 'type', label: 'Type' },
                    { value: 'product', label: 'Product' },
                    { value: 'campaign', label: 'Folder Name' },
                  ]}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
                    view === 'list'
                      ? 'bg-[var(--accent-color)] text-white shadow'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  aria-label="List view"
                >
                  <FiList />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('gallery')}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
                    view === 'gallery'
                      ? 'bg-[var(--accent-color)] text-white shadow'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  aria-label="Gallery view"
                >
                  <FiGrid />
                  <span className="hidden sm:inline">Gallery</span>
                </button>
              </div>
              <SaveButton onClick={saveAssets} canSave={dirty} loading={saving} />
              <IconButton
                onClick={() => setShowTagger(true)}
                aria-label="Add Drive Folder"
                className="!rounded-full !px-3 !py-1.5 !text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                <FiFolderPlus className="text-base" />
                <span className="hidden xl:inline">Add Drive Folder</span>
              </IconButton>
              <LoadingIconButton
                onClick={createMissingThumbnails}
                aria-label="Create Missing Thumbnails"
                disabled={loading}
                loading={thumbMissingLoading}
                icon={FiImage}
                className="!rounded-full !px-3 !py-1.5 !text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                <span className="hidden xl:inline">Thumbnails</span>
              </LoadingIconButton>
              <LoadingIconButton
                onClick={tagMissing}
                aria-label="Tag Missing"
                disabled={loading}
                loading={tagMissingLoading}
                icon={FiTag}
                className="!rounded-full !px-3 !py-1.5 !text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                <span className="hidden xl:inline">Auto Tag</span>
              </LoadingIconButton>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-4 py-6 sm:px-6">
          {hasSelection ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-[var(--accent-color)]/50 bg-[var(--accent-color-10)]/70 p-4 shadow-sm dark:border-[var(--accent-color)]/40 dark:bg-[var(--accent-color-20)]/30">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--accent-color)]">
                <span>Bulk edit selected assets</span>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                >
                  <FiTrash /> Delete Selected
                </button>
                <button
                  type="button"
                  onClick={createThumbnails}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900/90 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {thumbSelectedLoading ? (
                    <div className="loading-ring" style={{ width: '1em', height: '1em', borderWidth: '2px' }} />
                  ) : (
                    <FiImage />
                  )}
                  Generate Thumbnails
                </button>
                <button
                  type="button"
                  onClick={tagSelected}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900/90 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {tagSelectedLoading ? (
                    <div className="loading-ring" style={{ width: '1em', height: '1em', borderWidth: '2px' }} />
                  ) : (
                    <FiTag />
                  )}
                  Auto Tag Selected
                </button>
                <div className="flex flex-1 flex-col gap-3 rounded-2xl bg-white/70 p-3 shadow-inner backdrop-blur dark:bg-[var(--dark-sidebar)]/70">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input
                      className="w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                      placeholder="Type"
                      value={bulkValues.type}
                      onChange={(e) => setBulkValues({ ...bulkValues, type: e.target.value })}
                    />
                    <select
                      className="w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                      value={bulkValues.product}
                      onChange={(e) => setBulkValues({ ...bulkValues, product: e.target.value })}
                    >
                      <option value="">Product</option>
                      {products.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                      placeholder="Folder Name"
                      value={bulkValues.campaign}
                      onChange={(e) => setBulkValues({ ...bulkValues, campaign: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={bulkEdit}
                      className="inline-flex items-center justify-center rounded-full bg-[var(--accent-color)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/50"
                    >
                      Apply to Selected
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {view === 'list' ? (
            filtered.length > 0 ? (
              <div className="space-y-4">
                <Table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>URL</th>
                      <th>Thumbnail</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Product</th>
                      <th>Folder Name</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a, idx) => (
                      <tr key={a.id}>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={selected[a.id] || false}
                            onChange={(e) => handleCheckChange(e, startIdx + idx, a.id)}
                          />
                        </td>
                        <td className="max-w-[12rem] truncate text-gray-700 dark:text-gray-200" title={a.name}>
                          {a.name}
                        </td>
                        <td className="text-center">
                          {a.url && (
                            <button
                              type="button"
                              onClick={() => window.open(a.url, '_blank')}
                              className="inline-flex items-center justify-center rounded-full bg-[var(--accent-color-10)] p-2 text-[var(--accent-color)] transition-colors hover:brightness-95"
                              aria-label="Open link"
                            >
                              <FiLink />
                            </button>
                          )}
                        </td>
                        <td className="text-center" style={{ overflow: 'visible' }}>
                          {a.thumbnailUrl && (
                            <HoverPreview
                              preview={
                                <img
                                  src={a.thumbnailUrl}
                                  alt="preview"
                                  className="max-h-[25rem] w-auto object-contain"
                                />
                              }
                            >
                              <button
                                type="button"
                                onClick={() => window.open(a.thumbnailUrl, '_blank')}
                                className="inline-flex items-center justify-center rounded-full bg-[var(--accent-color)] p-2 text-white transition-colors hover:brightness-95"
                                aria-label="Preview image"
                              >
                                <FiImage />
                              </button>
                            </HoverPreview>
                          )}
                        </td>
                        <td>
                          <input
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                            value={a.type}
                            onMouseDown={handleInputDown('type', a.type)}
                            onMouseOver={handleInputOver(a.id)}
                            onChange={(e) => updateRow(a.id, 'type', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                            value={a.description}
                            onMouseDown={handleInputDown('description', a.description)}
                            onMouseOver={handleInputOver(a.id)}
                            onChange={(e) => updateRow(a.id, 'description', e.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                            value={a.product}
                            onMouseDown={handleInputDown('product', a.product)}
                            onMouseOver={handleInputOver(a.id)}
                            onChange={(e) => updateRow(a.id, 'product', e.target.value)}
                          >
                            <option value="">None</option>
                            {products.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                            value={a.campaign}
                            onMouseDown={handleInputDown('campaign', a.campaign)}
                            onMouseOver={handleInputOver(a.id)}
                            onChange={(e) => updateRow(a.id, 'campaign', e.target.value)}
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => deleteRow(a.id)}
                            aria-label="Delete"
                            className="inline-flex items-center justify-center rounded-full bg-red-50 p-2 text-red-600 transition-colors hover:bg-red-100"
                          >
                            <FiTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                    <span>
                      Showing {Math.min(visible.length, filtered.length)} of {filtered.length} asset{filtered.length === 1 ? '' : 's'}
                    </span>
                    {hasFilter ? (
                      <button
                        type="button"
                        onClick={() => setFilter('')}
                        className="text-[var(--accent-color)] hover:underline"
                      >
                        Clear filter
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="inline-flex items-center justify-center rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color-default)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
                      disabled={page === 0}
                    >
                      Prev
                    </button>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      className="inline-flex items-center justify-center rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color-default)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </button>
                  </div>
                </div>
                {canShowMore ? (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setRowsPerPage((s) => Math.min(s + PAGE_SIZE, filtered.length - startIdx))
                      }
                      className="inline-flex items-center justify-center rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-[var(--border-color-default)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
                    >
                      Show {PAGE_SIZE} More
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500 shadow-inner dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-300">
                {hasFilter ? 'No assets match your current filters yet.' : 'No brand assets have been added yet.'}
              </div>
            )
          ) : filtered.length > 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <div className="asset-gallery" ref={galleryRef}>
                {filtered.map((a) => (
                  <div key={a.id} className="asset-gallery-item group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                    {(a.thumbnailUrl || a.url) && (
                      <img
                        src={a.thumbnailUrl || a.url}
                        alt={a.name}
                        className="h-auto w-full object-contain"
                        onLoad={updateSpans}
                      />
                    )}
                    <div className="absolute inset-0 hidden items-center justify-center gap-2 bg-black/70 p-3 text-xs text-white transition-opacity group-hover:flex">
                      {a.url ? (
                        <a
                          href={a.url}
                          download
                          className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-black transition-colors hover:bg-white"
                        >
                          <FiDownload /> Download
                        </a>
                      ) : null}
                      {a.url ? (
                        <button
                          type="button"
                          onClick={() => window.open(a.url, '_blank')}
                          className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-black transition-colors hover:bg-white"
                        >
                          <FiLink /> Link
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deleteRow(a.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-1 text-white transition-colors hover:bg-red-500"
                      >
                        <FiTrash /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500 shadow-inner dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-300">
              {hasFilter ? 'No assets match your current filters yet.' : 'No brand assets have been added yet.'}
            </div>
          )}
        </div>
      </section>

      {showTagger ? <TaggerModal brandCode={brandCode} onClose={() => setShowTagger(false)} /> : null}
    </div>
  );
};

export default AssetLibrary;
