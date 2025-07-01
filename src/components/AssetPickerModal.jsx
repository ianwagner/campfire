import React, { useEffect, useState } from 'react';
import { FiImage, FiVideo } from 'react-icons/fi';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeAssetType } from '../RecipePreview.jsx';

const AssetPickerModal = ({ brandCode: propBrandCode = '', onSelect, onClose }) => {
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState('');
  const [brandCode, setBrandCode] = useState(propBrandCode);

  useEffect(() => {
    setBrandCode(propBrandCode);
  }, [propBrandCode]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const key = brandCode ? `assetLibrary_${brandCode}` : 'assetLibrary';
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && !cancelled) {
              setAssets(parsed);
              return;
            }
          } catch (err) {
            console.error('Failed to parse stored assets', err);
          }
        }

        let q = collection(db, 'adAssets');
        if (brandCode) {
          q = query(q, where('brandCode', '==', brandCode));
        }
        const snap = await getDocs(q);
        if (!cancelled) {
          setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Failed to load asset library', err);
        if (!cancelled) setAssets([]);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [brandCode]);

  const filtered = assets.filter((a) => {
    const term = filter.toLowerCase();
    return (
      !term ||
      a.name.toLowerCase().includes(term) ||
      (a.product || '').toLowerCase().includes(term) ||
      (a.campaign || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-h-[80vh] overflow-y-auto w-full max-w-lg dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {!propBrandCode && (
            <input
              type="text"
              className="p-1 border rounded w-32"
              placeholder="Brand Code"
              value={brandCode}
              onChange={(e) => setBrandCode(e.target.value)}
            />
          )}
          <input
            type="text"
            className="flex-1 p-1 border rounded"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" className="btn-secondary px-2 py-1" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="columns-2 sm:columns-3 gap-2">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect && onSelect(a)}
              className="break-inside-avoid mb-2 w-full"
            >
              {a.thumbnailUrl || a.url || a.firebaseUrl ? (
                <img
                  src={a.thumbnailUrl || a.url || a.firebaseUrl}
                  alt={a.name}
                  className="w-full h-auto object-contain border rounded"
                  style={{ minWidth: '100px' }}
                />
              ) : (
                <span
                  className={`p-4 text-xl rounded flex items-center justify-center w-full border ${
                    normalizeAssetType(a.type || a.assetType) === 'video'
                      ? ''
                      : 'bg-accent-10 text-accent'
                  }`}
                  style={
                    normalizeAssetType(a.type || a.assetType) === 'video'
                      ? { backgroundColor: 'rgba(0,17,255,0.1)', color: '#0011FF' }
                      : {}
                  }
                >
                  {normalizeAssetType(a.type || a.assetType) === 'video' ? <FiVideo /> : <FiImage />}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AssetPickerModal;
