import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import SortButton from './components/SortButton.jsx';
import isVideoUrl from './utils/isVideoUrl';

const ClientGallery = ({ brandCodes = [] }) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const galleryRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      if (!brandCodes || brandCodes.length === 0) {
        setAssets([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const base = collection(db, 'adAssets');
        const docs = [];
        for (let i = 0; i < brandCodes.length; i += 10) {
          const chunk = brandCodes.slice(i, i + 10);
          const q = query(
            base,
            where('brandCode', 'in', chunk),
            where('status', '==', 'approved')
          );
          const snap = await getDocs(q);
          docs.push(...snap.docs);
        }
        const seen = new Set();
        setAssets(
          docs
            .filter((d) => {
              if (seen.has(d.id)) return false;
              seen.add(d.id);
              return true;
            })
            .map((d) => ({ id: d.id, ...d.data() }))
        );
      } catch (err) {
        console.error('Failed to load assets', err);
        setAssets([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [brandCodes]);

  const updateSpans = () => {
    if (typeof window === 'undefined') return;
    const gallery = galleryRef.current;
    if (!gallery) return;
    const rowHeight = parseInt(
      window.getComputedStyle(gallery).getPropertyValue('grid-auto-rows')
    );
    const rowGap = parseInt(
      window.getComputedStyle(gallery).getPropertyValue('row-gap')
    );
    Array.from(gallery.children).forEach((child) => {
      const img = child.querySelector('img');
      if (img) {
        const h = img.getBoundingClientRect().height;
        const span = Math.ceil((h + rowGap) / (rowHeight + rowGap));
        child.style.gridRowEnd = `span ${span}`;
      }
    });
  };

  useEffect(() => {
    updateSpans();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSpans);
      return () => window.removeEventListener('resize', updateSpans);
    }
    return undefined;
  }, [assets]);

  const term = filter.toLowerCase();
  const filtered = assets
    .filter(
      (a) =>
        !term ||
        (a.name || '').toLowerCase().includes(term) ||
        (a.product || '').toLowerCase().includes(term) ||
        (a.campaign || '').toLowerCase().includes(term)
    )
    .sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortField === 'product')
        return (a.product || '').localeCompare(b.product || '');
      if (sortField === 'campaign')
        return (a.campaign || '').localeCompare(b.campaign || '');
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Gallery</h1>
      <PageToolbar
        left={(
          <>
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="p-1 border rounded"
            />
            <SortButton
              value={sortField}
              onChange={setSortField}
              options={[
                { value: 'createdAt', label: 'Date Added' },
                { value: 'name', label: 'Name' },
                { value: 'product', label: 'Product' },
                { value: 'campaign', label: 'Campaign' },
              ]}
            />
          </>
        )}
      />
      {loading ? (
        <p>Loading assets...</p>
      ) : filtered.length === 0 ? (
        <p>No media found.</p>
      ) : (
        <div className="asset-gallery mt-4" ref={galleryRef}>
          {filtered.map((a) => (
            <div key={a.id} className="asset-gallery-item">
              {isVideoUrl(a.firebaseUrl || a.url) ? (
                <VideoPlayer
                  src={a.firebaseUrl || a.url}
                  className="w-full h-auto object-contain"
                  controls
                />
              ) : (
                <OptimizedImage
                  pngUrl={a.thumbnailUrl || a.url || a.firebaseUrl}
                  alt={a.name}
                  className="w-full h-auto object-contain"
                  onLoad={updateSpans}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientGallery;
