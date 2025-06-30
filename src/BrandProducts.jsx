import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import { uploadBrandAsset } from './uploadBrandAsset';

const emptyImage = { url: '', file: null };
const emptyProduct = { name: '', description: '', benefits: '', images: [{ ...emptyImage }] };

const BrandProducts = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
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
                    description: p.description || '',
                    benefits: p.benefits || '',
                    images: Array.isArray(p.images) && p.images.length
                      ? p.images.map((u) => ({ url: u, file: null }))
                      : [{ ...emptyImage }],
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
                    description: p.description || '',
                    benefits: p.benefits || '',
                    images: Array.isArray(p.images) && p.images.length
                      ? p.images.map((u) => ({ url: u, file: null }))
                      : [{ ...emptyImage }],
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
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    try {
      const productData = [];
      for (const prod of products) {
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
          description: prod.description.trim(),
          benefits: prod.benefits.trim(),
          images: imgs,
        });
      }
      await setDoc(doc(db, 'brands', brandId), { products: productData }, { merge: true });
      setProducts(
        productData.map((p) => ({ ...p, images: p.images.map((u) => ({ url: u, file: null })) }))
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
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Products</h1>
      <form onSubmit={handleSave} className="space-y-4">
        {products.map((prod, pIdx) => (
          <div key={pIdx} className="border p-3 rounded space-y-2">
            <div>
              <label className="block mb-1 text-sm font-medium">Name</label>
              <input
                type="text"
                value={prod.name}
                onChange={(e) => updateProduct(pIdx, { name: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Description</label>
              <textarea
                value={prod.description}
                onChange={(e) => updateProduct(pIdx, { description: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Benefits</label>
              <textarea
                value={prod.benefits}
                onChange={(e) => updateProduct(pIdx, { benefits: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Images</label>
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
              <button type="button" onClick={() => addImage(pIdx)} className="underline text-sm">
                Add Image
              </button>
            </div>
            <button type="button" onClick={() => removeProduct(pIdx)} className="underline text-sm text-red-600">
              Delete Product
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setProducts((p) => [...p, { ...emptyProduct }])} className="underline">
          Add Product
        </button>
        {message && <p className="text-sm">{message}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Products'}
        </button>
      </form>
    </div>
  );
};

export default BrandProducts;
