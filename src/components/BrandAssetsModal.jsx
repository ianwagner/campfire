import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

const BrandAssetsModal = ({ brandCode, onClose }) => {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!brandCode) return;
      try {
        const q = query(collection(db, "brands"), where("code", "==", brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setBrand(snap.docs[0].data());
        }
      } catch (err) {
        console.error("Failed to load brand assets", err);
      }
    };
    load();
  }, [brandCode]);

  if (!brand) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
        <div className="bg-white p-4 rounded shadow max-w-md w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-md w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)] overflow-auto max-h-[90vh]">
        <h3 className="mb-2 font-semibold">Brand Assets</h3>
        <div className="space-y-3 text-sm">
          {brand.guidelinesUrl && (
            <div>
              <p className="font-medium mb-1">Guidelines</p>
              <a
                href={brand.guidelinesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Download PDF
              </a>
            </div>
          )}
          {Array.isArray(brand.logos) && brand.logos.length > 0 && (
            <div>
              <p className="font-medium mb-1">Logos</p>
              <div className="flex flex-wrap gap-2">
                {brand.logos.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`logo-${idx}`} className="h-16 w-auto border" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(brand.palette) && brand.palette.length > 0 && (
            <div>
              <p className="font-medium mb-1">Palette</p>
              <div className="flex flex-wrap gap-2">
                {brand.palette.map((color, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: color }} />
                    <span className="font-mono">{color}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(brand.fonts) && brand.fonts.length > 0 && (
            <div>
              <p className="font-medium mb-1">Fonts</p>
              <ul className="list-disc list-inside space-y-1">
                {brand.fonts.map((f, idx) => (
                  <li key={idx}>
                    {f.type === "custom" ? (
                      <a href={f.value} target="_blank" rel="noopener noreferrer" className="underline">
                        {f.value}
                      </a>
                    ) : (
                      f.value
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="btn-primary px-3 py-1">Close</button>
        </div>
      </div>
    </div>
  );
};

export default BrandAssetsModal;
