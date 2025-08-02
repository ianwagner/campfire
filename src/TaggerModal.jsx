import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { functions, db } from './firebase/config';
import syncAssetLibrary from './utils/syncAssetLibrary';
import { safeSetItem, safeRemoveItem } from './utils/safeLocalStorage.js';
import UrlCheckInput from './components/UrlCheckInput.jsx';
import Modal from './components/Modal.jsx';
import ScrollModal from './components/ScrollModal.jsx';
import HoverPreview from './components/HoverPreview.jsx';
import { FiImage, FiLoader } from 'react-icons/fi';

const typeOptions = ['Lifestyle', 'Video', 'POW', 'Background'];

const TaggerModal = ({ onClose, brandCode = '' }) => {
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [campaign, setCampaign] = useState('');
  const [product, setProduct] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

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

  const processRows = async (rows, startIdx) => {
    const tagFn = httpsCallable(functions, 'generateTagsForAssets', { timeout: 300000 });
    const thumbFn = httpsCallable(functions, 'generateThumbnailsForAssets', { timeout: 60000 });
    for (let i = 0; i < rows.length; i += 1) {
      try {
        const [{ data: tagData }, { data: thumbData }] = await Promise.all([
          tagFn({ assets: [rows[i]] }),
          thumbFn({ assets: [rows[i]] }),
        ]);
        const tag = tagData?.results?.[0] || {};
        const thumb = thumbData?.results?.[0] || {};
        updateResult(startIdx + i, 'type', tag.type || '');
        updateResult(startIdx + i, 'description', tag.description || '');
        if (thumb.thumbnailUrl) updateResult(startIdx + i, 'thumbnailUrl', thumb.thumbnailUrl);
      } catch (err) {
        console.error('Processing asset failed', err);
      }
      updateResult(startIdx + i, 'processing', false);
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
      const res = await callable(payload);
      const rows = Array.isArray(res.data?.results)
        ? res.data.results.map((r) => ({
            ...r,
            product,
            campaign,
            processing: true,
            thumbnailUrl: '',
          }))
        : [];
      const startIdx = results.length;
      setResults((p) => [...p, ...rows]);
      processRows(rows, startIdx);
    } catch (err) {
      console.error('Add rows from drive failed', err);
      setError('Failed to add rows');
    }
    setLoading(false);
  };

  const saveToLibrary = async () => {
    try {
      let q = collection(db, 'adAssets');
      if (brandCode) q = query(q, where('brandCode', '==', brandCode));
      const snap = await getDocs(q);
      const firebaseAssets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const arrByUrl = Object.fromEntries(
        firebaseAssets.filter((a) => a.url).map((a) => [a.url, a]),
      );
      const arr = [...firebaseAssets];
      for (const r of results) {
        if (arrByUrl[r.url]) {
          continue;
        }
        const newRow = {
          id: Math.random().toString(36).slice(2),
          createdAt: Date.now(),
          ...r,
          brandCode,
        };
        arr.push(newRow);
        arrByUrl[r.url] = newRow;
      }
      await syncAssetLibrary(brandCode, arr);
      onClose();
    } catch (err) {
      console.error('Failed to save assets', err);
    }
  };

  const handleClose = async () => {
    try {
      const thumbs = results.map((r) => r.thumbnailUrl).filter(Boolean);
      if (thumbs.length) {
        const callable = httpsCallable(functions, 'deleteThumbnails', { timeout: 60000 });
        await callable({ urls: thumbs });
      }
    } catch (err) {
      console.error('Failed to delete thumbnails', err);
    }
    onClose();
  };

  const FormFields = (
    <>
      <div>
        <label className="block mb-1 text-sm">Google Drive Folder Link</label>
        <UrlCheckInput value={driveFolderUrl} onChange={setDriveFolderUrl} inputClass="p-1" required />
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
    </>
  );

  if (results.length === 0) {
    return (
      <Modal sizeClass="max-w-md w-full">
        <h3 className="mb-2 font-semibold">Load Assets from Gdrive</h3>
        <form onSubmit={(e) => { e.preventDefault(); handleAddRows(); }} className="space-y-3">
          {FormFields}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-right space-x-2">
            <button type="button" onClick={handleClose} className="btn-secondary px-3 py-1">
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleAddRows}
              className="btn-primary px-3 py-1"
              disabled={loading}
            >
              Add Assets from Drive
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <ScrollModal
      sizeClass="max-w-4xl w-full"
      header={<h3 className="mb-2 font-semibold">Load Assets from Gdrive</h3>}
    >
      <div className="space-y-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddRows(); }}
          className="space-y-2"
        >
          {FormFields}
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
                <th>Thumbnail</th>
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
                  <td className="text-center">
                    {r.processing ? (
                      <FiLoader className="animate-spin inline" />
                    ) : (
                      r.thumbnailUrl && (
                        <HoverPreview
                          preview={
                            <img
                              src={r.thumbnailUrl}
                              alt="preview"
                              className="object-contain max-h-[25rem] w-auto"
                            />
                          }
                        >
                          <button
                            type="button"
                            onClick={() => window.open(r.thumbnailUrl, '_blank')}
                            className="p-2 text-xl rounded inline-flex items-center justify-center bg-[var(--accent-color-10)] text-accent"
                            aria-label="Preview image"
                          >
                            <FiImage />
                          </button>
                        </HoverPreview>
                      )
                    )}
                  </td>
                  <td>
                    <select
                      className="w-full p-1 border rounded"
                      value={r.type}
                      onChange={(e) => updateResult(idx, 'type', e.target.value)}
                    >
                      <option value="">Select</option>
                      {typeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
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
    </ScrollModal>
  );
};

export default TaggerModal;
