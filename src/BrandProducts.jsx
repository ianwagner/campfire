import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import createArchiveTicket from './utils/createArchiveTicket';
import { uploadBrandAsset } from './uploadBrandAsset';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import TagInput from './components/TagInput.jsx';

const emptyImage = { url: '', file: null };
const emptyProduct = { name: '', description: [], benefits: [], images: [{ ...emptyImage }], archived: false };

const BrandProducts = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes, role } = useUserRole(user?.uid);
  const isManager = role === 'manager';
  const isAdmin = role === 'admin';
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [products, setProducts] = useState([{ ...emptyProduct }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
          archived: !!prod.archived,
        });
      }
      await setDoc(doc(db, 'brands', brandId), { products: productData }, { merge: true });
      setProducts(
        productData.map((p) => ({ ...p, archived: false, images: p.images.map((u) => ({ url: u, file: null })) }))
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
    <PageWrapper title="Products">
      <form onSubmit={handleSave} className="space-y-4">
        {products
          .filter((p) => !p.archived)
          .map((prod, pIdx) => (
            <div key={pIdx} className="border p-3 rounded space-y-2">
            <FormField label="Name">
              <input
                type="text"
                value={prod.name}
                onChange={(e) => updateProduct(pIdx, { name: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Description">
              <TagInput
                id={`desc-${pIdx}`}
                value={prod.description}
                onChange={(arr) => updateProduct(pIdx, { description: arr })}
              />
            </FormField>
            <FormField label="Benefits">
              <TagInput
                id={`benefits-${pIdx}`}
                value={prod.benefits}
                onChange={(arr) => updateProduct(pIdx, { benefits: arr })}
              />
            </FormField>
            <FormField label="Images">
              {prod.images.map((img, idx) => (
                <div key={idx} className="mb-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => updateImage(pIdx, idx, e.target.files[0])}
                    className="w-full p-2 border rounded"
                  />
                  {img.url && <img src={img.url} alt="product" className="mt-1 h-16 w-auto" />}
                </div>
              ))}
              <button type="button" onClick={() => addImage(pIdx)} className="btn-action mt-1">
                Add Image
              </button>
            </FormField>
            <button type="button" onClick={() => removeProduct(pIdx)} className="btn-action mt-1">
              {isManager && !isAdmin ? 'Archive Product' : 'Delete Product'}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setProducts((p) => [...p, { ...emptyProduct }])} className="btn-action">
          Add Product
        </button>
        {message && <p className="text-sm">{message}</p>}
        <div className="text-right">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Products'}
          </button>
        </div>
      </form>
    </PageWrapper>
  );
};

export default BrandProducts;
