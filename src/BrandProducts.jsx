import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import createArchiveTicket from './utils/createArchiveTicket';
import { uploadBrandAsset } from './uploadBrandAsset';
import PageWrapper from './components/PageWrapper.jsx';
import ProductImportModal from './ProductImportModal.jsx';
import ProductCard from './components/ProductCard.jsx';
import ProductEditModal from './components/ProductEditModal.jsx';
import IconButton from './components/IconButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import SaveButton from './components/SaveButton.jsx';
import { FaMagic } from 'react-icons/fa';

const emptyImage = { url: '', file: null };
const emptyProduct = {
  name: '',
  description: [],
  benefits: [],
  images: [{ ...emptyImage }],
  featuredImage: '',
  archived: false,
};

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
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [brandCode, propId, propCode]);

  const updateImage = (pIdx, idx, file) => {
    setProducts((prev) =>
      prev.map((p, i) =>
        i === pIdx
          ? {
              ...p,
              images: p.images.map((img, j) =>
                j === idx ? { url: file ? URL.createObjectURL(file) : img.url, file } : img
              ),
            }
          : p
      )
    );
  };

  const updateProduct = (idx, changes) => {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...changes } : p)));
  };

  const addImage = (idx) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, images: [...p.images, { ...emptyImage }] } : p))
    );
  };

  const addImportedProduct = (prod) => {
    setProducts((p) => [...p, { ...prod, archived: false }]);
  };

  const removeProduct = (idx) => {
    if (isManager && !isAdmin) {
      setProducts((prev) =>
        prev.map((p, i) => (i === idx ? { ...p, archived: true } : p))
      );
      createArchiveTicket({ target: 'product', brandId, index: idx });
    } else {
      setProducts((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
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
          description: prod.description
            .map((d) => d.trim())
            .filter(Boolean),
          benefits: prod.benefits
            .map((b) => b.trim())
            .filter(Boolean),
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
    } catch (err) {
      console.error('Failed to save products', err);
      setMessage('Failed to save products');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <PageToolbar
        left={(
          <input
            type="text"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="p-1 border rounded"
          />
        )}
        right={(
          <>
            <IconButton aria-label="Import from URL" onClick={() => setShowImport(true)}>
              <FaMagic />
            </IconButton>
            <CreateButton
              onClick={() => {
                setProducts((p) => [...p, { ...emptyProduct }]);
                setEditIdx(products.length);
              }}
              ariaLabel="Add Product"
            />
            <SaveButton
              onClick={handleSave}
              canSave={!loading}
              loading={loading}
            />
          </>
        )}
      />
      {message && <p className="text-sm mb-2">{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products
          .filter((p) =>
            !p.archived &&
            (!filter || p.name.toLowerCase().includes(filter.toLowerCase()))
          )
          .map((prod, idx) => (
            <ProductCard key={idx} product={prod} onClick={() => setEditIdx(idx)} />
          ))}
      </div>
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
          onClose={() => setEditIdx(null)}
        />
      )}
    </PageWrapper>
  );
};

export default BrandProducts;
