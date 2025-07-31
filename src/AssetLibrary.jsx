import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FiTrash,
  FiLink,
  FiImage,
  FiPlus,
  FiFolderPlus,
  FiTag,
  FiUpload,
  FiList,
  FiGrid,
  FiDownload,
} from 'react-icons/fi';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import SaveButton from './components/SaveButton.jsx';
import LoadingIconButton from './components/LoadingIconButton.jsx';
import TabButton from './components/TabButton.jsx';
import SortButton from './components/SortButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import HoverPreview from './components/HoverPreview.jsx';
import { uploadBrandAsset } from './uploadBrandAsset';
import TaggerModal from './TaggerModal.jsx';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';
import { collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';

import syncAssetLibrary from "./utils/syncAssetLibrary";
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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef(null);
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

  const addRow = () => {
    const id = Math.random().toString(36).slice(2);
    setAssets((p) => [...p, { ...emptyAsset, id, createdAt: Date.now() }]);
    setDirty(true);
  };

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
              ? { ...a, type: result.type || a.type, description: result.description || a.description, product: result.product || a.product, campaign: result.campaign || a.campaign }
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


  const handleFolderUpload = async (files) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    const newAssets = [];
    for (const file of files) {
      try {
        const url = await uploadBrandAsset(file, brandCode, 'library');
        newAssets.push({
          ...emptyAsset,
          id: Math.random().toString(36).slice(2),
          createdAt: Date.now(),
          name: file.name,
          url,
          campaign: file.webkitRelativePath
            ? file.webkitRelativePath.split('/')[0]
            : '',
        });
      } catch (err) {
        console.error('Upload failed', err);
      }
    }
    setAssets((p) => [...p, ...newAssets]);
    setDirty(true);
    setLoading(false);
  };


  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const startIdx = page * PAGE_SIZE;
  const visible = filtered.slice(startIdx, startIdx + rowsPerPage);
  const canShowMore = startIdx + rowsPerPage < Math.min(filtered.length, (page + 1) * PAGE_SIZE);

  useUnsavedChanges(dirty, saveAssets);

  return (
    <div>
      <PageToolbar
        left={(
          <>
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="p-1 border rounded"
            />
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
            <div className="border-l h-6 mx-2" />
            <TabButton active={view === 'list'} onClick={() => setView('list')} aria-label="List view">
              <FiList />
            </TabButton>
            <TabButton active={view === 'gallery'} onClick={() => setView('gallery')} aria-label="Gallery view">
              <FiGrid />
            </TabButton>
          </>
        )}
        right={(
          <div className="flex flex-wrap gap-2 items-center relative">
            <span className="relative group">
              <SaveButton onClick={saveAssets} canSave={dirty} loading={saving} />
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Save
              </div>
            </span>
          <div className="border-l h-6 mx-2" />
          <span className="relative group">
            <IconButton
              onClick={() => setShowAddMenu((p) => !p)}
              aria-label="Add Folder"
              className="text-xl"
            >
              <FiFolderPlus />
            </IconButton>
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
              Upload Folder
            </div>
          </span>
          <div className="relative">
            {showAddMenu && (
              <div className="absolute right-0 mt-1 bg-white border rounded shadow z-10 dark:bg-[var(--dark-sidebar-bg)]">
                <button
                  type="button"
                  className="btn-action w-full text-left"
                  onClick={() => {
                    setShowAddMenu(false);
                    setShowTagger(true);
                  }}
                >
                  <FiLink /> Drive
                </button>
                <button
                  type="button"
                  className="btn-action w-full text-left"
                  onClick={() => {
                    setShowAddMenu(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <FiUpload /> Upload
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              webkitdirectory="true"
              className="hidden"
              onChange={(e) => {
                handleFolderUpload(e.target.files);
                e.target.value = null;
              }}
            />
          </div>
          <span className="relative group">
            <IconButton onClick={addRow} aria-label="Add Row" className="text-xl">
              <FiPlus />
            </IconButton>
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
              Add Row
            </div>
          </span>
          <div className="border-l h-6 mx-2" />
          <span className="relative group">
            <LoadingIconButton
              onClick={createMissingThumbnails}
              aria-label="Create Missing Thumbnails"
              disabled={loading}
              loading={thumbMissingLoading}
              icon={FiImage}
              className="text-xl"
            />
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
              Thumbnails
            </div>
          </span>
            <span className="relative group">
              <LoadingIconButton
                onClick={tagMissing}
                aria-label="Tag Missing"
                disabled={loading}
                loading={tagMissingLoading}
                icon={FiTag}
                className="text-xl"
              />
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Auto Tag
              </div>
            </span>
          </div>
        )}
      />
      {view === 'list' ? (
        <>
        {Object.keys(selected).some((k) => selected[k]) && (
          <div className="mb-2 flex flex-wrap gap-2 items-end">
            <span className="relative group">
              <IconButton onClick={deleteSelected} aria-label="Delete Selected" className="btn-delete text-xl">
                <FiTrash />
              </IconButton>
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Delete
              </div>
            </span>
            <span className="relative group">
              <LoadingIconButton
                onClick={createThumbnails}
                aria-label="Create Thumbnails"
                disabled={loading}
                loading={thumbSelectedLoading}
                icon={FiImage}
                className="text-xl"
              />
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Thumbnails
              </div>
            </span>
            <span className="relative group">
              <LoadingIconButton
                onClick={tagSelected}
                aria-label="Tag Selected"
                disabled={loading}
                loading={tagSelectedLoading}
                icon={FiTag}
                className="text-xl"
              />
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Auto Tag
              </div>
            </span>
          <input
            className="p-1 border rounded"
            placeholder="Type"
            value={bulkValues.type}
            onChange={(e) => setBulkValues({ ...bulkValues, type: e.target.value })}
          />
          <select
            className="p-1 border rounded"
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
            className="p-1 border rounded"
            placeholder="Folder Name"
            value={bulkValues.campaign}
            onChange={(e) => setBulkValues({ ...bulkValues, campaign: e.target.value })}
          />
          <button type="button" className="btn-secondary" onClick={bulkEdit}>
            Apply To Selected
          </button>
        </div>
        )}
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
                <td title={a.name}>{a.name.length > 10 ? `${a.name.slice(0, 10)}...` : a.name}</td>
                <td className="text-center">
                  {a.url && (
                    <button
                      type="button"
                      onClick={() => window.open(a.url, '_blank')}
                      className="p-2 text-xl rounded inline-flex items-center justify-center hover:bg-[var(--accent-color-10)] text-accent"
                      aria-label="Open link"
                    >
                      <FiLink />
                    </button>
                  )}
                </td>
                <td className="text-center">
                  {a.thumbnailUrl && (
                    <HoverPreview
                      preview={
                        <img
                          src={a.thumbnailUrl}
                          alt="preview"
                          className="object-contain max-h-[25rem] w-auto"
                        />
                      }
                    >
                      <button
                        type="button"
                        onClick={() => window.open(a.thumbnailUrl, '_blank')}
                        className="p-2 text-xl rounded inline-flex items-center justify-center bg-[var(--accent-color-10)] text-accent"
                        aria-label="Preview image"
                      >
                        <FiImage />
                      </button>
                    </HoverPreview>
                  )}
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.type}
                    onMouseDown={handleInputDown('type', a.type)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'type', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.description}
                    onMouseDown={handleInputDown('description', a.description)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'description', e.target.value)}
                  />
                </td>
                <td>
                  <select
                    className="w-full p-1 border rounded"
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
                    className="w-full p-1 border rounded"
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
                    className="btn-delete"
                  >
                    <FiTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex items-center justify-between mt-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="btn-secondary px-2 py-1"
            disabled={page === 0}
          >
            &lt;
          </button>
          <span className="text-sm">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="btn-secondary px-2 py-1"
            disabled={page >= totalPages - 1}
          >
            &gt;
          </button>
        </div>
        {canShowMore && (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() =>
                setRowsPerPage((s) => Math.min(s + PAGE_SIZE, filtered.length - startIdx))
              }
              className="btn-secondary px-3 py-1"
            >
              Show 25 More
            </button>
          </div>
        )}
        </>
      ) : (
        <div className="asset-gallery mt-4" ref={galleryRef}>
          {filtered.map((a) => (
            <div key={a.id} className="asset-gallery-item group">
              {(a.thumbnailUrl || a.url) && (
                <img
                  src={a.thumbnailUrl || a.url}
                  alt={a.name}
                  className="w-full h-auto object-contain"
                  onLoad={updateSpans}
                />
              )}
              <div className="absolute inset-0 bg-black bg-opacity-60 hidden group-hover:flex flex-col items-center justify-center gap-1 text-white text-xs">
                {a.url && (
                  <a href={a.url} download className="btn-secondary px-1 py-0.5 flex items-center gap-1">
                    <FiDownload /> <span>Download</span>
                  </a>
                )}
                {a.url && (
                  <button type="button" onClick={() => window.open(a.url, '_blank')} className="btn-secondary px-1 py-0.5 flex items-center gap-1">
                    <FiLink /> <span>Link</span>
                  </button>
                )}
                <button type="button" onClick={() => deleteRow(a.id)} className="btn-delete px-1 py-0.5 flex items-center gap-1">
                  <FiTrash /> <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showTagger && (
        <TaggerModal brandCode={brandCode} onClose={() => setShowTagger(false)} />
      )}
    </div>
  );
};

export default AssetLibrary;
