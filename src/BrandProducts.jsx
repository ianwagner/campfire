import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import createArchiveTicket from './utils/createArchiveTicket';
import { uploadBrandAsset } from './uploadBrandAsset';
import ProductImportModal from './ProductImportModal.jsx';
import ProductCard from './components/ProductCard.jsx';
import ProductEditModal from './components/ProductEditModal.jsx';
import AddProductCard from './components/AddProductCard.jsx';
import IconButton from './components/IconButton.jsx';
import CreateButton from './components/CreateButton.jsx';
import SaveButton from './components/SaveButton.jsx';
import { FaMagic } from 'react-icons/fa';
import useUnsavedChanges from './useUnsavedChanges.js';

const emptyImage = { url: '', file: null };
const emptyProduct = {
  name: '',
  url: '',
  description: [],
  benefits: [],
  images: [{ ...emptyImage }],
  featuredImage: '',
  archived: false,
};

const inputClassName =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]';

const BrandProducts = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes, role } = useUserRole(user?.uid);
  const isManager = role === 'manager' || role === 'editor';
  const isAdmin = role === 'admin';
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [products, setProducts] = useState([{ ...emptyProduct }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!propId && !propCode) {
      setBrandCode(brandCodes[0] || '');
    }
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
            setProducts(
              Array.isArray(data.products) && data.products.length
                ? data.products.map((p) => ({
                    name: p.name || '',
                    url: p.url || '',
                    description: Array.isArray(p.description)
                      ? p.description
                      : typeof p.description === 'string'
                      ? p.description
                          .split(/[;\n]+/)
                          .map((d) => d.trim())
                          .filter(Boolean)
                      : [],
                    benefits: Array.isArray(p.benefits)
                      ? p.benefits
                      : typeof p.benefits === 'string'
                      ? p.benefits
                          .split(/[;\n]+/)
                          .map((d) => d.trim())
                          .filter(Boolean)
                      : [],
                    images: Array.isArray(p.images) && p.images.length
                      ? p.images.map((u) => ({ url: u, file: null }))
                      : [{ ...emptyImage }],
                    featuredImage: p.featuredImage || '',
                    archived: !!p.archived,
                  }))
                : [{ ...emptyProduct }]
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
            setProducts(
              Array.isArray(data.products) && data.products.length
                ? data.products.map((p) => ({
                    name: p.name || '',
                    url: p.url || '',
                    description: Array.isArray(p.description)
                      ? p.description
                      : typeof p.description === 'string'
                      ? p.description
                          .split(/[;\n]+/)
                          .map((d) => d.trim())
                          .filter(Boolean)
                      : [],
                    benefits: Array.isArray(p.benefits)
                      ? p.benefits
                      : typeof p.benefits === 'string'
                      ? p.benefits
                          .split(/[;\n]+/)
                          .map((d) => d.trim())
                          .filter(Boolean)
                      : [],
                    images: Array.isArray(p.images) && p.images.length
                      ? p.images.map((u) => ({ url: u, file: null }))
                      : [{ ...emptyImage }],
                    featuredImage: p.featuredImage || '',
                    archived: !!p.archived,
                  }))
                : [{ ...emptyProduct }]
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

  const updateProduct = (idx, changes) => {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...changes } : p)));
    setDirty(true);
  };

  const addImportedProduct = (prod) => {
    setProducts((p) => [...p, { ...prod, archived: false }]);
    setDirty(true);
  };

  const removeProduct = (idx) => {
    if (isManager && !isAdmin) {
      setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, archived: true } : p)));
      createArchiveTicket({ target: 'product', brandId, index: idx, brandCode });
    } else {
      setProducts((prev) => prev.filter((_, i) => i !== idx));
    }
    setDirty(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    try {
      const productData = [];
      for (const prod of products) {
        if (prod.archived) continue;
        const imgs = [];
        for (const img of prod.images) {
          if (img.file) {
            const url = await uploadBrandAsset(img.file, brandCode, 'products');
            imgs.push(url);
          } else if (img.url) {
            imgs.push(img.url);
          }
        }
        productData.push({
          name: prod.name.trim(),
          url: (prod.url || '').trim(),
          description: prod.description.map((d) => d.trim()).filter(Boolean),
          benefits: prod.benefits.map((b) => b.trim()).filter(Boolean),
          images: imgs,
          featuredImage: prod.featuredImage || '',
          archived: !!prod.archived,
        });
      }
      await setDoc(doc(db, 'brands', brandId), { products: productData }, { merge: true });
      setProducts(
        productData.map((p) => ({
          ...p,
          archived: false,
          images: p.images.map((u) => ({ url: u, file: null })),
        }))
      );
      setMessage('Products saved');
      setDirty(false);
    } catch (err) {
      console.error('Failed to save products', err);
      setMessage('Failed to save products');
    } finally {
      setLoading(false);
    }
  };

  useUnsavedChanges(dirty, handleSave);

  const visibleProducts = products.filter(
    (p) => !p.archived && (!filter || p.name.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Product Library</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Keep a curated list of products, hero images, and key benefits ready for campaign briefs.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <input
              type="text"
              placeholder="Filter products"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`${inputClassName} sm:w-64`}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <IconButton aria-label="Import from URL" onClick={() => setShowImport(true)}>
                <FaMagic />
              </IconButton>
              <CreateButton
                onClick={() => {
                  setProducts((p) => [...p, { ...emptyProduct }]);
                  setEditIdx(products.length);
                  setDirty(true);
                }}
                ariaLabel="Add Product"
              />
              <SaveButton onClick={handleSave} canSave={dirty && !loading} loading={loading} />
            </div>
          </div>
        </div>

        {message && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300" role="status">
            {message}
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {visibleProducts.map((prod, idx) => (
            <ProductCard key={idx} product={prod} onClick={() => setEditIdx(idx)} />
          ))}
          <AddProductCard
            onAdd={() => {
              setProducts((p) => [...p, { ...emptyProduct }]);
              setEditIdx(products.length);
            }}
            onImport={() => setShowImport(true)}
          />
        </div>
      </section>

      {showImport && (
        <ProductImportModal
          brandCode={brandCode}
          onAdd={addImportedProduct}
          onClose={() => setShowImport(false)}
        />
      )}

      {editIdx !== null && (
        <ProductEditModal
          product={products[editIdx]}
          brandCode={brandCode}
          onSave={(p) => updateProduct(editIdx, p)}
          onDelete={() => removeProduct(editIdx)}
          onClose={() => setEditIdx(null)}
        />
      )}
    </div>
  );
};

export default BrandProducts;
