import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import BrandSetup from './BrandSetup';
import AssetLibrary from './AssetLibrary.jsx';
import ReviewLibrary from './ReviewLibrary.jsx';
import BrandProducts from './BrandProducts.jsx';
import BrandCampaigns from './BrandCampaigns.jsx';
import TabButton from './components/TabButton.jsx';
import BrandCard from './components/BrandCard.jsx';
import {
  FiSettings,
  FiFolder,
  FiStar,
  FiShoppingCart,
  FiMessageCircle,
  FiFileText,
  FiFeather,
  FiFlag,
  FiBookOpen,
  FiMessageSquare,
} from 'react-icons/fi';
import BrandTone from './BrandTone.jsx';
import BrandContracts from './BrandContracts.jsx';
import BrandAIArtStyle from './BrandAIArtStyle.jsx';
import BrandNotes from './BrandNotes.jsx';
import BrandFeedback from './BrandFeedback.jsx';

const BrandProfile = ({ brandId: propId = null, backPath = '/brand-profile' }) => {
  const { id } = useParams();
  const brandId = propId || id || null;
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandCode, setBrandCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('setup');
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      if (brandId) {
        try {
          const snap = await getDoc(doc(db, 'brands', brandId));
          if (snap.exists()) {
            const data = snap.data();
            setBrandCode(data.code || '');
            setBrandName(data.name || '');
          }
        } catch (err) {
          console.error('Failed to load brand', err);
        }
      } else if (brandCodes.length === 1) {
        const code = brandCodes[0];
        setBrandCode(code);
        try {
          const q = query(collection(db, 'brands'), where('code', '==', code));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setBrandName(snap.docs[0].data().name || code);
          } else {
            setBrandName(code);
          }
        } catch (err) {
          console.error('Failed to load brand by code', err);
          setBrandName(code);
        }
      } else if (brandCodes.length > 1) {
        setLoading(true);
        try {
          const base = collection(db, 'brands');
          const chunks = [];
          for (let i = 0; i < brandCodes.length; i += 10) {
            chunks.push(brandCodes.slice(i, i + 10));
          }
          const docs = [];
          for (const chunk of chunks) {
            const q = query(base, where('code', 'in', chunk));
            const snap = await getDocs(q);
            docs.push(...snap.docs);
          }
          setBrands(docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
          console.error('Failed to load brands', err);
          setBrands([]);
        } finally {
          setLoading(false);
        }
      }
    };
    load();
  }, [brandId, brandCodes]);

  const displayBrands = useMemo(() => {
    const term = filter.trim().toLowerCase();

    return [...brands]
      .filter((brand) => {
        if (!term) return true;
        const values = [
          brand.name,
          brand.code,
          brand.tagline,
          brand.description,
          brand.toneOfVoice,
          brand.offering,
        ].map((value) => (value ? String(value).toLowerCase() : ''));
        return values.some((value) => value.includes(term));
      })
      .sort((a, b) => {
        const nameA = (a.name || a.code || '').toLowerCase();
        const nameB = (b.name || b.code || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [brands, filter]);

  const hasFilter = Boolean(filter.trim());
  if (!brandId && brandCodes.length > 1) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
        <div className="px-4 py-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Directory</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Browse all of your brands, then open one to manage setup, feedback, and assets.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search brands"
                    aria-label="Search brands"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                  />
                </div>
                {loading ? (
                  <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                    Loading brands...
                  </div>
                ) : displayBrands.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {displayBrands.map((b) => (
                      <Link
                        key={b.id}
                        to={`/brand-profile/${b.id}`}
                        className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                      >
                        <BrandCard brand={b} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                    {hasFilter ? (
                      <p className="mb-0">No brands match “{filter.trim()}”. Try a different search term.</p>
                    ) : (
                      <p className="mb-0">No brands available yet.</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-center">
            {id && (
              <Link to={backPath} className="btn-arrow mr-2" aria-label="Back">
                &lt;
              </Link>
            )}
            <h1 className="text-2xl">{brandName || 'Brand Profile'}</h1>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <TabButton active={tab === 'setup'} onClick={() => setTab('setup')}>
              <FiSettings /> <span>Brand Setup</span>
            </TabButton>
            <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
              <FiFolder /> <span>Asset Library</span>
            </TabButton>
            <TabButton active={tab === 'tone'} onClick={() => setTab('tone')}>
              <FiMessageCircle /> <span>Tone of Voice</span>
            </TabButton>
            <TabButton active={tab === 'ai'} onClick={() => setTab('ai')}>
              <FiFeather /> <span>AI Art Style</span>
            </TabButton>
            <TabButton active={tab === 'reviews'} onClick={() => setTab('reviews')}>
              <FiStar /> <span>Customer Reviews</span>
            </TabButton>
            <TabButton active={tab === 'products'} onClick={() => setTab('products')}>
              <FiShoppingCart /> <span>Products</span>
            </TabButton>
            <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')}>
              <FiFlag /> <span>Campaigns</span>
            </TabButton>
            <TabButton active={tab === 'feedback'} onClick={() => setTab('feedback')}>
              <FiMessageSquare /> <span>Feedback</span>
            </TabButton>
            <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
              <FiBookOpen /> <span>Notes</span>
            </TabButton>
            <TabButton active={tab === 'contracts'} onClick={() => setTab('contracts')}>
              <FiFileText /> <span>Contracts</span>
            </TabButton>
          </div>
          <div className="pb-6">
            {tab === 'setup' && <BrandSetup brandId={brandId} />}
            {tab === 'tone' && <BrandTone brandId={brandId} brandCode={brandCode} />}
            {tab === 'ai' && <BrandAIArtStyle brandId={brandId} brandCode={brandCode} />}
            {tab === 'library' && <AssetLibrary brandCode={brandCode} />}
            {tab === 'reviews' && <ReviewLibrary brandCode={brandCode} />}
            {tab === 'products' && <BrandProducts brandId={brandId} brandCode={brandCode} />}
            {tab === 'campaigns' && <BrandCampaigns brandId={brandId} brandCode={brandCode} />}
            {tab === 'feedback' && (
              <BrandFeedback brandId={brandId} brandCode={brandCode} brandName={brandName} />
            )}
            {tab === 'notes' && <BrandNotes brandId={brandId} />}
            {tab === 'contracts' && (
              <BrandContracts brandId={brandId} brandCode={brandCode} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandProfile;
