import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from './firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import syncAssetLibrary from './utils/syncAssetLibrary';
import FormField from './components/FormField.jsx';
import TagInput from './components/TagInput.jsx';
import ScrollModal from './components/ScrollModal.jsx';

const emptyImage = { url: '', file: null };

const ProductImportModal = ({ brandCode = '', onAdd, onClose }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [product, setProduct] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const callable = httpsCallable(functions, 'parsePdp');
      const res = await callable({ url });
      const data = res.data || {};
      setProduct({
        name: data.name || '',
        description: Array.isArray(data.description) ? data.description : [],
        benefits: Array.isArray(data.benefits) ? data.benefits : [],
        images: Array.isArray(data.imageUrls) && data.imageUrls.length
          ? data.imageUrls.map((u) => ({ url: u, file: null }))
          : [{ ...emptyImage }],
      });
    } catch (err) {
      console.error('Failed to parse PDP', err);
      setError('Failed to parse URL');
    } finally {
      setLoading(false);
    }
  };

  const saveToLibrary = async (items) => {
    try {
      let q = collection(db, 'adAssets');
      if (brandCode) q = query(q, where('brandCode', '==', brandCode));
      const snap = await getDocs(q);
      const firebaseAssets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const arrByUrl = Object.fromEntries(firebaseAssets.filter((a) => a.url).map((a) => [a.url, a]));
      const arr = [...firebaseAssets];
      for (const item of items) {
        if (arrByUrl[item.url]) continue;
        const newRow = {
          id: Math.random().toString(36).slice(2),
          createdAt: Date.now(),
          url: item.url,
          thumbnailUrl: item.thumbnailUrl || '',
          name: product.name,
          product: product.name,
        };
        arr.push(newRow);
        arrByUrl[item.url] = newRow;
      }
      await syncAssetLibrary(brandCode, arr);
    } catch (err) {
      console.error('Failed to save assets', err);
    }
  };

  const confirm = async () => {
    if (!product) return;
    try {
      setLoading(true);
      const imgs = product.images.map((i) => i.url).filter(Boolean);
      const callable = httpsCallable(functions, 'cacheProductImages');
      const res = await callable({ urls: imgs, brandCode, productName: product.name });
      const uploaded = Array.isArray(res.data?.images) ? res.data.images : [];
      const slug = res.data?.slug || '';

      await saveToLibrary(uploaded);

      onAdd({
        name: product.name,
        description: product.description,
        benefits: product.benefits,
        images: uploaded.map((u) => ({ url: u.url, file: null })),
        slug,
      });
      onClose();
    } catch (err) {
      console.error('Failed to cache images', err);
      setError('Failed to save images');
    } finally {
      setLoading(false);
    }
  };

  const removeImage = (idx) => {
    setProduct((p) => ({
      ...p,
      images: p.images.filter((_, i) => i !== idx),
    }));
  };

  if (!product) {
    return (
      <ScrollModal
        sizeClass="max-w-md w-full"
        header={<h3 className="p-2 mb-0 font-semibold">Import Product</h3>}
      >
        <div className="space-y-2 p-2">
          <FormField label="PDP URL">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-right space-x-2">
            <button type="button" onClick={onClose} className="btn-secondary px-3 py-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={fetchData}
              className="btn-primary px-3 py-1"
              disabled={loading || !url}
            >
              {loading ? 'Loading...' : 'Fetch'}
            </button>
          </div>
        </div>
      </ScrollModal>
    );
  }

  return (
    <ScrollModal
      sizeClass="max-w-md w-full"
      header={<h3 className="p-2 mb-0 font-semibold">Review Product</h3>}
    >
      <div className="space-y-3 p-2">
        <FormField label="Name">
          <input
            type="text"
            value={product.name}
            onChange={(e) => setProduct({ ...product, name: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Description">
          <TagInput
            value={product.description}
            onChange={(arr) => setProduct({ ...product, description: arr })}
          />
        </FormField>
        <FormField label="Benefits">
          <TagInput
            value={product.benefits}
            onChange={(arr) => setProduct({ ...product, benefits: arr })}
          />
        </FormField>
        <FormField label="Images">
          <div className="grid grid-cols-2 gap-2">
            {product.images.map((img, idx) => (
              <div key={idx} className="relative">
                <img src={img.url} alt="prod" className="w-full h-auto border rounded" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 bg-white bg-opacity-75 rounded-full px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="text-right space-x-2">
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="btn-primary px-3 py-1"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Add Product'}
          </button>
        </div>
      </div>
    </ScrollModal>
  );
};

export default ProductImportModal;

