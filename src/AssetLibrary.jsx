import React, { useState, useEffect, useRef } from 'react';
import {
  FiTrash,
  FiLink,
  FiImage,
  FiSave,
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
import TabButton from './components/TabButton.jsx';
import SortButton from './components/SortButton.jsx';
import { uploadBrandAsset } from './uploadBrandAsset';
import TaggerModal from './TaggerModal.jsx';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';
import { collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';

import syncAssetLibrary from "./utils/syncAssetLibrary";

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
  const [view, setView] = useState('list');
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE);

  const lastIdx = useRef(null);
  const dragValue = useRef(null);
  const dragField = useRef(null);
  const galleryRef = useRef(null);

  const updateSpans = () => {
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
          setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    window.addEventListener('mouseup', up);
    return () => {
      cancelled = true;
      window.removeEventListener('mouseup', up);
    };
  }, [brandCode]);

  useEffect(() => {
    setPage(0);
    setRowsPerPage(PAGE_SIZE);
  }, [filter, assets]);

  useEffect(() => {
    setRowsPerPage(PAGE_SIZE);
  }, [page]);

  useEffect(() => {
    if (view === 'gallery') {
      updateSpans();
      window.addEventListener('resize', updateSpans);
      return () => window.removeEventListener('resize', updateSpans);
    }
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
  };

  const createMissingThumbnails = async () => {
    const rows = assets.filter((a) => !a.thumbnailUrl && a.url);
    if (rows.length === 0) return;
    setLoading(true);
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
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await tagRow(row);
    }
    setLoading(false);
    setDirty(true);
  };

  const tagMissing = async () => {
    const rows = assets.filter((a) => (!a.type || !a.description) && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await tagRow(row);
    }
    setLoading(false);
    setDirty(true);
  };

  const saveAssets = async () => {
    try {
      await syncAssetLibrary(brandCode, assets);
      alert('Assets saved');
      setDirty(false);
    } catch (err) {
      console.error('Failed to save assets', err);
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


  const filtered = assets
    .filter((a) => {
      const term = filter.toLowerCase();
      return (
        !term ||
        (a.name || '').toLowerCase().includes(term) ||
        (a.product || '').toLowerCase().includes(term) ||
        (a.campaign || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (sortField === 'createdAt') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortField === 'type') return (a.type || '').localeCompare(b.type || '');
      if (sortField === 'product') return (a.product || '').localeCompare(b.product || '');
      if (sortField === 'campaign') return (a.campaign || '').localeCompare(b.campaign || '');
      return (a.name || '').localeCompare(b.name || '');
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const startIdx = page * PAGE_SIZE;
  const visible = filtered.slice(startIdx, startIdx + rowsPerPage);
  const canShowMore = startIdx + rowsPerPage < Math.min(filtered.length, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2 items-center">
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
        </div>
        <div className="flex flex-wrap gap-2 flex-1 order-last md:order-none justify-center">
          <TabButton active={view === 'list'} onClick={() => setView('list')} aria-label="List view">
            <FiList />
          </TabButton>
          <TabButton active={view === 'gallery'} onClick={() => setView('gallery')} aria-label="Gallery view">
            <FiGrid />
          </TabButton>
        </div>
        <div className="flex flex-wrap gap-2 items-center relative">
          <span className="relative group">
            <IconButton
              onClick={saveAssets}
              aria-label="Save"
              disabled={!dirty}
              className={`text-xl ${dirty ? 'bg-[var(--accent-color-10)] text-accent' : ''}`}
            >
              <FiSave />
            </IconButton>
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
            <IconButton onClick={createMissingThumbnails} aria-label="Create Missing Thumbnails" disabled={loading} className="text-xl">
              <FiImage />
            </IconButton>
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
              Thumbnails
            </div>
          </span>
          <span className="relative group">
            <IconButton onClick={tagMissing} aria-label="Tag Missing" disabled={loading} className="text-xl">
              <FiTag />
            </IconButton>
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
              Auto Tag
            </div>
          </span>
        </div>
      </div>
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
              <IconButton
                onClick={createThumbnails}
                aria-label="Create Thumbnails"
                disabled={loading}
                className="text-xl"
              >
                <FiImage />
              </IconButton>
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Thumbnails
              </div>
            </span>
            <span className="relative group">
              <IconButton
                onClick={tagSelected}
                aria-label="Tag Selected"
                disabled={loading}
                className="text-xl"
              >
                <FiTag />
              </IconButton>
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
          <input
            className="p-1 border rounded"
            placeholder="Product"
            value={bulkValues.product}
            onChange={(e) => setBulkValues({ ...bulkValues, product: e.target.value })}
          />
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
                    <span className="relative inline-block group">
                      <button
                        type="button"
                        onClick={() => window.open(a.thumbnailUrl, '_blank')}
                        className="p-2 text-xl rounded inline-flex items-center justify-center bg-[var(--accent-color-10)] text-accent"
                        aria-label="Preview image"
                      >
                        <FiImage />
                      </button>
                      <img
                        src={a.thumbnailUrl}
                        alt="preview"
                        className="hidden group-hover:block absolute left-full ml-2 top-1/2 -translate-y-1/2 min-w-[100px] w-auto h-auto border shadow-lg z-10"
                      />
                    </span>
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
                  <input
                    className="w-full p-1 border rounded"
                    value={a.product}
                    onMouseDown={handleInputDown('product', a.product)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'product', e.target.value)}
                  />
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
