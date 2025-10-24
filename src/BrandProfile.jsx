import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import BrandSetup from './BrandSetup';
import AssetLibrary from './AssetLibrary.jsx';
import ReviewLibrary from './ReviewLibrary.jsx';
import BrandProducts from './BrandProducts.jsx';
import BrandCampaigns from './BrandCampaigns.jsx';
import TabButton from './components/TabButton.jsx';
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
  const [brandCode, setBrandCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('setup');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!brandId) {
        setBrandCode('');
        setBrandName('');
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotFound(false);
      try {
        const snap = await getDoc(doc(db, 'brands', brandId));
        if (snap.exists()) {
          const data = snap.data();
          setBrandCode(data.code || '');
          setBrandName(data.name || '');
        } else {
          setBrandCode('');
          setBrandName('');
          setNotFound(true);
        }
      } catch (err) {
        console.error('Failed to load brand', err);
        setBrandCode('');
        setBrandName('');
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [brandId]);

  if (notFound) {
    const backLink = backPath || '/brand-profile';
    const isDirectoryBack = backLink === '/brand-profile';
    const backLabel = isDirectoryBack ? 'Go to Brand Directory' : 'Go back';
    const message = isDirectoryBack
      ? "We couldn't find that brand. Return to the Brand Directory and choose a different brand."
      : "We couldn't find that brand. Return to the previous page and choose a different brand.";
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
        <div className="px-4 py-6">
          <div className="mx-auto max-w-6xl">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Profile</h1>
                <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
                <Link
                  to={backLink}
                  className="inline-flex items-center justify-center rounded-lg border border-transparent bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                >
                  {backLabel}
                </Link>
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
            {loading ? (
              <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                Loading brand...
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandProfile;
