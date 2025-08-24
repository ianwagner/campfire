import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import SortButton from './components/SortButton.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import isVideoUrl from './utils/isVideoUrl';

const ClientGallery = ({ brandCodes = [] }) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [view, setView] = useState('table');
  const galleryRef = useRef(null);

  const getStatusClass = (s) =>
    s ? `status-${String(s).replace(/\s+/g, '_').toLowerCase()}` : '';

  useEffect(() => {
    let unsub = null;
    const load = async () => {
      if (!brandCodes || brandCodes.length === 0) {
        setAssets([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const chunks = [];
        for (let i = 0; i < brandCodes.length; i += 10) {
          chunks.push(brandCodes.slice(i, i + 10));
        }

        const snaps = await Promise.all(
          chunks.map((chunk) =>
            getDocs(
              query(
                collection(db, 'adAssets'),
                where('brandCode', 'in', chunk)
              )
            )
          )
        );

        const seen = new Set();
        const docs = snaps.flatMap((s) => s.docs);
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

    unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        load();
      } else {
        setAssets([]);
        setLoading(false);
      }
    });

    return () => {
      if (unsub) unsub();
    };
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
        right={(
          <div className="flex gap-2">
            <button
              className={`${view === 'table' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('table')}
            >
              Table
            </button>
            <button
              className={`${view === 'gallery' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('gallery')}
            >
              Gallery
            </button>
          </div>
        )}
      />
      {loading ? (
        <p>Loading assets...</p>
      ) : filtered.length === 0 ? (
        <p>No media found.</p>
      ) : view === 'gallery' ? (
        <div className="asset-gallery mt-4" ref={galleryRef}>
          {filtered.map((a) => (
            <div key={a.id} className="asset-gallery-item relative">
              <span
                className={`status-dot ${getStatusClass(a.status)} absolute top-1 right-1`}
              />
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
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="text-left p-2">Preview</th>
                <th className="text-left p-2">File Name</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2 w-24">
                    {isVideoUrl(a.firebaseUrl || a.url) ? (
                      <VideoPlayer
                        src={a.firebaseUrl || a.url}
                        className="w-20 h-auto object-contain"
                        controls
                      />
                    ) : (
                      <OptimizedImage
                        pngUrl={a.thumbnailUrl || a.url || a.firebaseUrl}
                        alt={a.name}
                        className="w-20 h-auto object-contain"
                      />
                    )}
                  </td>
                  <td className="p-2 align-top">{a.name}</td>
                  <td className="p-2 align-top">
                    <StatusBadge status={a.status} />
                    {a.status === 'edit_requested' && a.comment && (
                      <div className="mt-1 text-sm">{a.comment}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClientGallery;
