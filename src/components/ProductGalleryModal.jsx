import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import Modal from './Modal.jsx';
import OptimizedImage from './OptimizedImage.jsx';
import { FiStar } from 'react-icons/fi';

const ProductGalleryModal = ({ brandCode = '', productName = '', featured = '', onSelect, onClose }) => {
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        let q = collection(db, 'adAssets');
        const conditions = [];
        if (brandCode) conditions.push(where('brandCode', '==', brandCode));
        if (productName) conditions.push(where('product', '==', productName));
        if (conditions.length) q = query(q, ...conditions);
        const snap = await getDocs(q);
        setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load assets', err);
        setAssets([]);
      }
    };
    load();
  }, [brandCode, productName]);

  return (
    <Modal sizeClass="max-w-3xl w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Product Images</h3>
        <button type="button" onClick={onClose} className="btn-secondary px-2 py-1">Close</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[70vh] overflow-auto">
        {assets.map((a) => {
          const url = a.thumbnailUrl || a.url || a.firebaseUrl;
          return (
            <div key={a.id} className="relative">
              <button type="button" onClick={() => onSelect && onSelect(url)} className="w-full">
                <OptimizedImage pngUrl={url} alt={a.name} className="w-full h-auto object-contain border rounded" />
              </button>
              <button
                type="button"
                onClick={() => onSelect && onSelect(url)}
                className="absolute top-1 right-1 text-xl text-yellow-500"
              >
                <FiStar fill={featured === url ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default ProductGalleryModal;
