import React, { useState, useEffect } from 'react';
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
} from 'react-icons/fi';
import BrandTone from './BrandTone.jsx';
import BrandContracts from './BrandContracts.jsx';
import BrandAIArtStyle from './BrandAIArtStyle.jsx';
import BrandNotes from './BrandNotes.jsx';

const BrandProfile = ({ brandId: propId = null }) => {
  const { id } = useParams();
  const brandId = propId || id || null;
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandCode, setBrandCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('setup');
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);

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
  if (!brandId && brandCodes.length > 1) {
    return (
      <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Brand Profile</h1>
        {loading ? (
          <p>Loading brands...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {brands.map((b) => (
              <Link key={b.id} to={`/brand-profile/${b.id}`}>
                <BrandCard brand={b} />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="flex items-center mb-2">
        {id && (
          <Link to="/brand-profile" className="btn-arrow mr-2" aria-label="Back">
            &lt;
          </Link>
        )}
        <h1 className="text-2xl mb-0">{brandName || 'Brand Profile'}</h1>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
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
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
          <FiBookOpen /> <span>Notes</span>
        </TabButton>
        <TabButton active={tab === 'contracts'} onClick={() => setTab('contracts')}>
          <FiFileText /> <span>Contracts</span>
        </TabButton>
      </div>
      {tab === 'setup' && <BrandSetup brandId={brandId} />}
      {tab === 'tone' && <BrandTone brandId={brandId} brandCode={brandCode} />}
      {tab === 'ai' && <BrandAIArtStyle brandId={brandId} brandCode={brandCode} />}
      {tab === 'library' && <AssetLibrary brandCode={brandCode} />}
      {tab === 'reviews' && <ReviewLibrary brandCode={brandCode} />}
      {tab === 'products' && <BrandProducts brandId={brandId} brandCode={brandCode} />}
      {tab === 'campaigns' && <BrandCampaigns brandId={brandId} brandCode={brandCode} />}
      {tab === 'notes' && <BrandNotes brandId={brandId} />}
      {tab === 'contracts' && (
        <BrandContracts brandId={brandId} brandCode={brandCode} />
      )}
    </div>
  );
};

export default BrandProfile;
