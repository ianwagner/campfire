import React, { useState, useEffect } from 'react';
import ScrollModal from './components/ScrollModal.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  deleteField,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { FiInfo } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import UrlCheckInput from './components/UrlCheckInput.jsx';
import useUserRole from './useUserRole';
import DueDateMonthSelector from './components/DueDateMonthSelector.jsx';
import getMonthString from './utils/getMonthString.js';

const DescribeProjectModal = ({ onClose, brandCodes = [], request = null, resetStatus = false }) => {
  const [title, setTitle] = useState('');
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');
  const [dueDate, setDueDate] = useState('');
  const [month, setMonth] = useState(getMonthString());
  const [products, setProducts] = useState([{ product: '', quantity: 1, newProduct: '' }]);
  const [assetLinks, setAssetLinks] = useState(['']);
  const [details, setDetails] = useState('');
  const [brandProducts, setBrandProducts] = useState([]);

  const { role, agencyId } = useUserRole(auth.currentUser?.uid);
  const isAgency = role === 'agency' || !!agencyId;

  useEffect(() => {
    if (request) {
      setTitle(request.title || '');
      setBrandCode(request.brandCode || brandCodes[0] || '');
      setDueDate(
        request.dueDate
          ? (request.dueDate.toDate
              ? request.dueDate.toDate()
              : new Date(request.dueDate)
            )
              .toISOString()
              .slice(0, 10)
          : ''
      );
      setProducts(
        request.products && request.products.length
          ? request.products.map((p) => ({ product: p.product, quantity: p.quantity, newProduct: '' }))
          : [{ product: '', quantity: 1, newProduct: '' }]
      );
      setAssetLinks(request.assetLinks && request.assetLinks.length ? request.assetLinks : ['']);
      setDetails(request.details || '');
      setMonth(request.month || getMonthString());
    } else {
      setProducts([{ product: '', quantity: 1, newProduct: '' }]);
    }
  }, [request, brandCodes]);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!brandCode) {
        setBrandProducts([]);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const prods = Array.isArray(data.products)
            ? data.products.map((p) => p.name)
            : [];
          setBrandProducts(prods);
          setProducts((prev) =>
            prev.map((p) =>
              prods.includes(p.product)
                ? { ...p, newProduct: '' }
                : p.product && p.product !== '__new__'
                ? { ...p, newProduct: p.product, product: '__new__' }
                : p
            )
          );
        } else {
          setBrandProducts([]);
        }
      } catch (err) {
        console.error('Failed to fetch products', err);
        setBrandProducts([]);
      }
    };
    fetchProducts();
  }, [brandCode]);

  const addAssetLink = () => {
    setAssetLinks((l) => [...l, '']);
  };

  const handleAssetLinkChange = (idx, val) => {
    setAssetLinks((arr) => {
      const next = [...arr];
      next[idx] = val;
      return next;
    });
  };

  const removeAssetLink = (idx) => {
    setAssetLinks((arr) => {
      const next = arr.filter((_, i) => i !== idx);
      return next.length ? next : [''];
    });
  };

  // URL verification handled by UrlCheckInput component

  const addProductField = () => {
    setProducts((p) => [...p, { product: '', quantity: 1, newProduct: '' }]);
  };

  const handleProductChange = (idx, field, value) => {
    setProducts((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'product' && value !== '__new__') next[idx].newProduct = '';
      return next;
    });
  };

  const removeProductField = (idx) => {
    setProducts((arr) => arr.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!brandCode) {
      console.warn('handleSave called without brandCode');
    }
    if (!title.trim()) {
      window.alert('Please enter a title before saving.');
      return;
    }
    try {
        const productData = (products || [])
          .map((p) => {
            const name = p.product === '__new__' ? p.newProduct : p.product;
            return name ? { product: name, quantity: Number(p.quantity) || 0 } : null;
          })
          .filter(Boolean);
        const totalAds = productData.reduce((sum, p) => sum + p.quantity, 0);
        let projectId = request?.projectId;
        if (request) {
          await updateDoc(doc(db, 'requests', request.id), {
            brandCode,
            title: title.trim(),
            dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
            numAds: totalAds,
            products: productData,
            assetLinks: (assetLinks || []).filter((l) => l),
            details,
            month: month || null,
            ...(resetStatus ? { status: 'new', clientInfoResponse: deleteField() } : {}),
          });
          if (projectId) {
            await updateDoc(doc(db, 'projects', projectId), {
              title: title.trim(),
              brandCode,
              status: 'processing',
              month: month || null,
              ...(agencyId ? { agencyId } : {}),
              products: productData,
            });
          }
        } else {
          const projRef = await addDoc(collection(db, 'projects'), {
            title: title.trim(),
            recipeTypes: [],
            brandCode,
            status: 'processing',
            createdAt: serverTimestamp(),
            userId: auth.currentUser?.uid || null,
            month: month || null,
            agencyId: agencyId || null,
            products: productData,
          });
          projectId = projRef.id;
          await addDoc(collection(db, 'requests'), {
            type: 'newAds',
            brandCode,
            title: title.trim(),
            dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
            numAds: totalAds,
            products: productData,
            assetLinks: (assetLinks || []).filter((l) => l),
            details,
            status: 'new',
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid || null,
            projectId,
            month: month || null,
          });

        }

        onClose({
          id: projectId,
          title: title.trim(),
          status: 'processing',
          brandCode,
          dueDate: dueDate ? new Date(dueDate) : null,
          numAds: totalAds,
          products: productData,
          assetLinks: (assetLinks || []).filter((l) => l),
          details,
          month: month || null,
        });
      } catch (err) {
        console.error('Failed to create project request', err);
      }
    };

  return (
    <ScrollModal
      sizeClass="max-w-md w-full"
      header={<h2 className="text-xl font-semibold p-2">Describe Project</h2>}
    >
      <div className="space-y-3 p-2">
        {request?.infoNote && (
          <div className="bg-yellow-50 border rounded p-2">
            <p className="text-black dark:text-[var(--dark-text)] mb-0">
              Info Needed: {request.infoNote}
            </p>
          </div>
        )}
        {brandCodes.length > 1 && (
          <div>
            <label className="block mb-1 text-sm font-medium">Brand</label>
            <select value={brandCode} onChange={(e) => setBrandCode(e.target.value)} className="w-full p-2 border rounded">
              {brandCodes.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <DueDateMonthSelector
          dueDate={dueDate}
          setDueDate={setDueDate}
          month={month}
          setMonth={setMonth}
          isAgency={isAgency}
        />
        {brandCode && (
          <div>
            <label className="block mb-1 text-sm font-medium">Products</label>
            {products.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <select
                  value={p.product}
                  onChange={(e) => handleProductChange(idx, 'product', e.target.value)}
                  className="p-2 border rounded flex-1"
                >
                  <option value="">Select product</option>
                  {brandProducts.map((prod) => (
                    <option key={prod} value={prod}>{prod}</option>
                  ))}
                  <option value="__new__">Add new</option>
                </select>
                {p.product === '__new__' && (
                  <input
                    type="text"
                    value={p.newProduct}
                    onChange={(e) => handleProductChange(idx, 'newProduct', e.target.value)}
                    className="p-2 border rounded flex-1"
                    placeholder="New product name"
                  />
                )}
                <input
                  type="number"
                  min="1"
                  value={p.quantity}
                  onChange={(e) => handleProductChange(idx, 'quantity', e.target.value)}
                  className="w-24 p-2 border rounded"
                />
                {products.length > 1 && (
                  <button type="button" onClick={() => removeProductField(idx)} className="text-red-600 text-sm">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addProductField} className="text-sm text-[var(--accent-color)] underline">Add product</button>
          </div>
        )}
        <div>
              <label className="block mb-1 text-sm font-medium flex items-center gap-1">
            Gdrive Link
            <InfoTooltip text="Add a link to new assets you'd like to use." maxWidth={200}>
              <FiInfo className="text-gray-500" />
            </InfoTooltip>
          </label>
          {assetLinks.map((link, idx) => (
            <UrlCheckInput
              key={idx}
              value={link}
              onChange={(val) => handleAssetLinkChange(idx, val)}
              onRemove={() => removeAssetLink(idx)}
              inputClass="p-2"
              className="mb-1"
            />
          ))}
          <button
            type="button"
            onClick={addAssetLink}
            className="text-sm text-[var(--accent-color)] underline mb-2"
          >
            Add another link
          </button>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Details</label>
          <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full p-2 border rounded" />
        </div>
      </div>
      <div className="flex justify-end gap-2 p-2">
        <button className="btn-secondary" onClick={() => onClose(null)}>Cancel</button>
        <button className="btn-primary" onClick={handleSave}>Save</button>
      </div>
    </ScrollModal>
  );
};

export default DescribeProjectModal;
