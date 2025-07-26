import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';
import FormField from './components/FormField.jsx';
import TagInput from './components/TagInput.jsx';

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

  const confirm = async () => {
    if (!product) return;
    try {
      setLoading(true);
      const imgs = product.images.map((i) => i.url).filter(Boolean);
      const callable = httpsCallable(functions, 'cacheProductImages');
      const res = await callable({ urls: imgs, brandCode, productName: product.name });
      const uploaded = Array.isArray(res.data?.urls) ? res.data.urls : [];
      const slug = res.data?.slug || '';
      onAdd({
        name: product.name,
        description: product.description,
        benefits: product.benefits,
        images: uploaded.map((u) => ({ url: u, file: null })),
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

  const updateImage = (idx, urlVal) => {
    setProduct((p) => ({
      ...p,
      images: p.images.map((img, i) => (i === idx ? { ...img, url: urlVal } : img)),
    }));
  };

  if (!product) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
        <div className="bg-white p-4 rounded shadow max-w-md w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
          <h3 className="mb-2 font-semibold">Import Product</h3>
          <FormField label="PDP URL">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-right space-x-2 mt-2">
            <button type="button" onClick={onClose} className="btn-secondary px-3 py-1">
              Cancel
            </button>
            <button type="button" onClick={fetchData} className="btn-primary px-3 py-1" disabled={loading || !url}>
              {loading ? 'Loading...' : 'Fetch'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4 overflow-auto">
      <div className="bg-white p-4 rounded shadow max-w-md w-full space-y-3 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <h3 className="font-semibold">Review Product</h3>
        <FormField label="Name">
          <input
            type="text"
            value={product.name}
            onChange={(e) => setProduct({ ...product, name: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Description">
          <TagInput value={product.description} onChange={(arr) => setProduct({ ...product, description: arr })} />
        </FormField>
        <FormField label="Benefits">
          <TagInput value={product.benefits} onChange={(arr) => setProduct({ ...product, benefits: arr })} />
        </FormField>
        <FormField label="Image URLs">
          {product.images.map((img, idx) => (
            <input
              key={idx}
              type="text"
              value={img.url}
              onChange={(e) => updateImage(idx, e.target.value)}
              className="w-full p-1 border rounded mb-1"
            />
          ))}
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="text-right space-x-2">
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="btn-primary px-3 py-1" disabled={loading}>
            {loading ? 'Saving...' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductImportModal;

