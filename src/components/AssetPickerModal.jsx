import React, { useEffect, useState } from 'react';
import { FiImage, FiVideo } from 'react-icons/fi';
import { normalizeAssetType } from '../RecipePreview.jsx';

const AssetPickerModal = ({ brandCode = '', onSelect, onClose }) => {
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    try {
      const key = brandCode ? `assetLibrary_${brandCode}` : 'assetLibrary';
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setAssets(parsed);
    } catch (err) {
      console.error('Failed to load asset library', err);
    }
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
        <div className="flex items-center gap-2 mb-2">
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
        <div className="space-y-1">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect && onSelect(a)}
              className="w-full text-left flex items-center gap-2 p-1 rounded hover:bg-accent-10"
            >
              <span
                className={`p-1 text-xl rounded inline-flex items-center justify-center ${
                  normalizeAssetType(a.type || a.assetType) === 'video' ? '' : 'bg-accent-10 text-accent'
                }`}
                style={
                  normalizeAssetType(a.type || a.assetType) === 'video'
                    ? { backgroundColor: 'rgba(0,17,255,0.1)', color: '#0011FF' }
                    : {}
                }
              >
                {normalizeAssetType(a.type || a.assetType) === 'video' ? <FiVideo /> : <FiImage />}
              </span>
              <span className="flex-1 truncate">{a.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AssetPickerModal;
