import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { functions, db, storage } from './firebase/config';
import syncAssetLibrary from './utils/syncAssetLibrary';
import LoadingOverlay from './LoadingOverlay';
import { safeSetItem, safeRemoveItem } from './utils/safeLocalStorage.js';
import UrlCheckInput from './components/UrlCheckInput.jsx';
import ScrollModal from './components/ScrollModal.jsx';

const TaggerModal = ({ onClose, brandCode = '' }) => {
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [campaign, setCampaign] = useState('');
  const [product, setProduct] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [thumbsToCleanup, setThumbsToCleanup] = useState([]);

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

  const handleClose = async () => {
    for (const url of thumbsToCleanup) {
      try {
        const path = new URL(url).pathname.split('/').slice(2).join('/');
        await deleteObject(ref(storage, path));
      } catch (err) {
        console.error('Failed to delete thumbnail', err);
      }
    }
    setThumbsToCleanup([]);
    onClose();
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
      setThumbsToCleanup([]);
      onClose();
    } catch (err) {
      console.error('Failed to save assets', err);
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
      const listCallable = httpsCallable(functions, 'listDriveFiles', { timeout: 60000 });
      const res = await listCallable(payload);
      let rows = Array.isArray(res.data?.results)
        ? res.data.results.map((r) => ({ ...r, product, campaign }))
        : [];

      if (rows.length) {
        try {
          const tagCallable = httpsCallable(functions, 'generateTagsForAssets', { timeout: 300000 });
          const tagRes = await tagCallable({ assets: rows.map(({ url, name }) => ({ url, name })) });
          const tagged = tagRes.data?.results || [];
          rows = rows.map((r) => {
            const match = tagged.find((t) => t.url === r.url);
            return match ? { ...r, type: match.type || r.type, description: match.description || r.description } : r;
          });
        } catch (err) {
          console.error('Failed to tag assets', err);
        }

        try {
          const thumbCallable = httpsCallable(functions, 'generateThumbnailsForAssets', { timeout: 60000 });
          const thumbRes = await thumbCallable({ assets: rows.map(({ url, name }) => ({ url, name })) });
          const thumbs = thumbRes.data?.results || [];
          rows = rows.map((r) => {
            const match = thumbs.find((t) => t.name === r.name);
            if (match && match.thumbnailUrl) {
              setThumbsToCleanup((prev) => [...prev, match.thumbnailUrl]);
              return { ...r, thumbnailUrl: match.thumbnailUrl };
            }
            return r;
          });
        } catch (err) {
          console.error('Failed to generate thumbnails', err);
        }
      }

      setResults((p) => [...p, ...rows]);
    } catch (err) {
      console.error('Add rows from drive failed', err);
      setError('Failed to add rows');
    }
    setLoading(false);
  };

  return (
    <ScrollModal sizeClass="max-w-3xl w-full" header={<h3 className="mb-2 font-semibold p-2">Load Assets from Gdrive</h3>}>
      {loading && <LoadingOverlay text="Processing assets..." className="!absolute" />}
      {results.length === 0 ? (
        <form onSubmit={(e) => { e.preventDefault(); handleAddRows(); }} className="space-y-3 p-2">
          <div>
            <label className="block mb-1 text-sm">Google Drive Folder Link</label>
            <UrlCheckInput
              value={driveFolderUrl}
              onChange={setDriveFolderUrl}
              inputClass="p-1"
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
            <button type="button" onClick={handleClose} className="btn-secondary px-3 py-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary px-3 py-1" disabled={loading}>
              Add Assets from Drive
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 p-2">
          <form onSubmit={(e) => { e.preventDefault(); handleAddRows(); }} className="space-y-2">
            <div>
              <label className="block mb-1 text-sm">Google Drive Folder Link</label>
              <UrlCheckInput
                value={driveFolderUrl}
                onChange={setDriveFolderUrl}
                inputClass="p-1"
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
                Add Assets from Drive
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
            <button onClick={handleClose} className="btn-secondary px-3 py-1">
              Close
            </button>
            <button onClick={saveToLibrary} className="btn-primary px-3 py-1">
              Save
            </button>
          </div>
        </div>
      )}
    </ScrollModal>
  );
};

export default TaggerModal;
