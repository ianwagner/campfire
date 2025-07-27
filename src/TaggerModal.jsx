import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, getDocs, query, where } from 'firebase/firestore';
import { functions, db } from './firebase/config';
import syncAssetLibrary from "./utils/syncAssetLibrary";
import LoadingOverlay from './LoadingOverlay';
import { safeSetItem, safeRemoveItem } from './utils/safeLocalStorage.js';

const TaggerModal = ({ onClose, brandCode = '' }) => {
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [campaign, setCampaign] = useState('');
  const [product, setProduct] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');

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
          const names = prods.map((p) => p.name).filter(Boolean);
          setProducts(names);
          if (!product && names.length === 1) setProduct(names[0]);
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
    if (!product) return;
    setResults((prev) => prev.map((r) => ({ ...r, product })));
  }, [product]);

  useEffect(() => {
    safeSetItem('taggerModalOpen', 'true');
    return () => {
      safeRemoveItem('taggerModalOpen');
    };
  }, []);

  const updateResult = (idx, field, value) => {
    setResults((p) => p.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const saveToLibrary = async () => {
    try {
      // fetch existing assets from Firestore so we don't create duplicates
      let q = collection(db, 'adAssets');
      if (brandCode) q = query(q, where('brandCode', '==', brandCode));
      const snap = await getDocs(q);
      const firebaseAssets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const arrByUrl = Object.fromEntries(firebaseAssets.filter(a => a.url).map(a => [a.url, a]));
      const arr = [...firebaseAssets];

      for (const r of results) {
        if (arrByUrl[r.url]) {
          continue; // already in library
        }
        const newRow = { id: Math.random().toString(36).slice(2), createdAt: Date.now(), ...r };
        arr.push(newRow);
        arrByUrl[r.url] = newRow;
      }

      await syncAssetLibrary(brandCode, arr);
      safeRemoveItem('pendingTaggerJobId');
      safeRemoveItem('pendingTaggerJobBrand');
      onClose();
    } catch (err) {
      console.error('Failed to save assets', err);
    }
  };

  useEffect(() => {
    if (!jobId) return undefined;
    const unsub = onSnapshot(doc(db, 'taggerJobs', jobId), (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === 'complete') {
        const newResults = Array.isArray(data.results)
          ? data.results.map((r) => ({ ...r, product }))
          : [];
        setResults((prev) => [...prev, ...newResults]);
        setLoading(false);
      } else if (data.status === 'error') {
        setError(data.error || 'Failed to tag assets');
        setLoading(false);
      }
    });
    return () => unsub();
  }, [jobId, product]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!driveFolderUrl || driveFolderUrl.trim() === '') {
      setError('Drive folder URL is required');
      return;
    }
    setLoading(true);
    setError('');
    setJobId('');
    try {
      const payload = {
        driveFolderUrl: driveFolderUrl.trim(),
        campaign,
      };
      const callable = httpsCallable(functions, 'tagger', { timeout: 300000 });
      const res = await callable({ data: payload, ...payload });
      if (res.data?.jobId) {
        setJobId(res.data.jobId);
        try {
          safeSetItem('pendingTaggerJobId', res.data.jobId);
          if (brandCode) safeSetItem('pendingTaggerJobBrand', brandCode);
        } catch (err) {
          // ignore
        }
      } else {
        throw new Error('No job ID returned');
      }
    } catch (err) {
      console.error('Tagger failed', err);
      if (err) {
        console.error('Error code:', err.code);
        console.error('Error message:', err.message);
        console.error('Error details:', err.details);
      }
      setError('Failed to tag assets');
      setLoading(false);
    }
  };

  const handleAddRows = async () => {
    if (!driveFolderUrl || driveFolderUrl.trim() === '') {
      setError('Drive folder URL is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = { driveFolderUrl: driveFolderUrl.trim(), campaign };
      const callable = httpsCallable(functions, 'listDriveFiles', { timeout: 60000 });
      const res = await callable({ data: payload, ...payload });
      const rows = Array.isArray(res.data?.results)
        ? res.data.results.map((r) => ({ ...r, product }))
        : [];
      setResults((p) => [...p, ...rows]);
    } catch (err) {
      console.error('Add rows from drive failed', err);
      setError('Failed to add rows');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-lg w-full relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        {loading && <LoadingOverlay text="Tagging assets..." className="!absolute" />}
        <h3 className="mb-2 font-semibold">Tag Assets from Drive</h3>
        {((!jobId && results.length === 0) || loading) ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block mb-1 text-sm">Google Drive Folder Link</label>
              <input
                type="text"
                value={driveFolderUrl}
                onChange={(e) => setDriveFolderUrl(e.target.value)}
                className="w-full p-1 border rounded"
                required
              />
            </div>
            <div>
              <label className="block mb-1 text-sm">Folder Name</label>
              <input
                type="text"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="w-full p-1 border rounded"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm">Product</label>
              <select
                className="w-full p-1 border rounded"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value="">Select</option>
                {products.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="text-right space-x-2">
              <button type="button" onClick={onClose} className="btn-secondary px-3 py-1">
                Cancel
              </button>
              <button type="button" onClick={handleAddRows} className="btn-primary px-3 py-1" disabled={loading}>
                Add Rows from Drive
              </button>
              
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <form onSubmit={(e) => { e.preventDefault(); handleAddRows(); }} className="space-y-2">
              <div>
                <label className="block mb-1 text-sm">Google Drive Folder Link</label>
                <input
                  type="text"
                  value={driveFolderUrl}
                  onChange={(e) => setDriveFolderUrl(e.target.value)}
                  className="w-full p-1 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">Folder Name</label>
                <input
                  type="text"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  className="w-full p-1 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">Product</label>
                <select
                  className="w-full p-1 border rounded"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  <option value="">Select</option>
                  {products.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <button type="submit" className="btn-primary px-3 py-1" disabled={loading}>
                  Add Rows from Drive
                </button>
              </div>
            </form>
            <div className="overflow-x-auto max-h-96">
              <table className="ad-table min-w-max text-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>URL</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Product</th>
                    <th>Folder Name</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="w-full p-1 border rounded"
                          value={r.name}
                          onChange={(e) => updateResult(idx, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="w-full p-1 border rounded"
                          value={r.url}
                          onChange={(e) => updateResult(idx, 'url', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="w-full p-1 border rounded"
                          value={r.type}
                          onChange={(e) => updateResult(idx, 'type', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="w-full p-1 border rounded"
                          value={r.description}
                          onChange={(e) => updateResult(idx, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="w-full p-1 border rounded"
                          value={r.product}
                          onChange={(e) => updateResult(idx, 'product', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="w-full p-1 border rounded"
                          value={r.campaign}
                          onChange={(e) => updateResult(idx, 'campaign', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right space-x-2">
              <button onClick={onClose} className="btn-secondary px-3 py-1">
                Close
              </button>
              <button onClick={saveToLibrary} className="btn-primary px-3 py-1">
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaggerModal;
