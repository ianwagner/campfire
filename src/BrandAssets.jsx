import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase/config";
import OptimizedImage from "./components/OptimizedImage.jsx";
import Modal from "./components/Modal.jsx";

const BrandAssets = ({ brandCode, onClose, inline = false }) => {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!brandCode) return;
      try {
        const q = query(collection(db, "brands"), where("code", "==", brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setBrand({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error("Failed to load brand", err);
      }
    };
    load();
  }, [brandCode]);

  if (!brand) return null;

  const content = (
    <>
      {onClose && !inline && (
        <button onClick={onClose} className="absolute top-2 right-2 btn-secondary px-3 py-1">
          Close
        </button>
      )}
      <h3 className="mb-3 font-semibold text-lg">Brand Assets</h3>
        {brand.guidelinesUrl && (
          <div className="mb-3">
            <a href={brand.guidelinesUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Brand Guidelines
            </a>
          </div>
        )}
        {Array.isArray(brand.logos) && brand.logos.length > 0 && (
          <div className="mb-3">
            <p className="font-medium text-sm mb-1">Logos</p>
            <div className="flex flex-wrap gap-2">
              {brand.logos.map((url, idx) => (
                <OptimizedImage key={idx} pngUrl={url} alt="logo" className="h-16 w-auto" />
              ))}
            </div>
          </div>
        )}
        {Array.isArray(brand.palette) && brand.palette.length > 0 && (
          <div className="mb-3">
            <p className="font-medium text-sm mb-1">Palette</p>
            <div className="flex flex-wrap gap-2">
              {brand.palette.map((color, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: color }} />
                  <span className="text-sm font-mono">{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {Array.isArray(brand.fonts) && brand.fonts.length > 0 && (
          <div className="mb-3">
            <p className="font-medium text-sm mb-1">Typefaces</p>
            <ul className="list-disc list-inside space-y-1">
              {brand.fonts.map((f, idx) => {
                if (!f || typeof f !== 'object') return null;
                const { type, value, name } = f;
                if (!value) return null;
                return (
                  <li key={idx} className="text-sm">
                    {type === 'google' ? (
                      value
                    ) : (
                      <a href={value} target="_blank" rel="noopener noreferrer" className="underline">
                        {name || `Custom Font ${idx + 1}`}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {Array.isArray(brand.notes) && brand.notes.length > 0 && (
          <div className="mb-3">
            <p className="font-medium text-sm mb-1">Brand Notes</p>
            <ul className="list-disc list-inside space-y-1">
              {brand.notes.map((n, idx) => (
                <li key={idx} className="text-sm whitespace-pre-wrap">{n}</li>
              ))}
            </ul>
          </div>
        )}
      </>
  );

  if (inline) {
    return (
      <div
        className="mb-4 bg-white p-4 rounded shadow max-w-md w-full overflow-auto relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
        style={{ outline: '1px solid var(--border-color-default, #d1d5db)' }}
      >
        {content}
      </div>
    );
  }

  return (
    <Modal
      sizeClass="max-w-md w-full"
      className="relative overflow-auto"
      style={{ outline: '1px solid var(--border-color-default, #d1d5db)' }}
    >
      {content}
    </Modal>
  );
};

export default BrandAssets;
