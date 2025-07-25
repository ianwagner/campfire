import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import BrandSetup from './BrandSetup';
import AssetLibrary from './AssetLibrary.jsx';
import ReviewLibrary from './ReviewLibrary.jsx';
import BrandProducts from './BrandProducts.jsx';
import TabButton from './components/TabButton.jsx';
import {
  FiSettings,
  FiFolder,
  FiStar,
  FiShoppingCart,
  FiMessageCircle,
  FiFileText,
  FiFeather,
} from 'react-icons/fi';
import BrandTone from './BrandTone.jsx';
import BrandContracts from './BrandContracts.jsx';
import BrandAIArtStyle from './BrandAIArtStyle.jsx';

const BrandProfile = ({ brandId: propId = null }) => {
  const { id } = useParams();
  const brandId = propId || id || null;
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandCode, setBrandCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('setup');

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
      } else if (brandCodes.length > 0) {
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
      }
    };
    load();
  }, [brandId, brandCodes]);

  return (
    <div className="min-h-screen p-4">
      <div className="flex items-center mb-2">
        {id && (
          <Link to="/admin/brands" className="btn-arrow mr-2" aria-label="Back">
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
        <TabButton active={tab === 'contracts'} onClick={() => setTab('contracts')}>
          <FiFileText /> <span>Contracts</span>
        </TabButton>
      </div>
      {tab === 'setup' && <BrandSetup brandId={brandId} />}
      {tab === 'tone' && <BrandTone brandId={brandId} brandCode={brandCode} />}
      {tab === 'ai' && <BrandAIArtStyle />}
      {tab === 'library' && <AssetLibrary brandCode={brandCode} />}
      {tab === 'reviews' && <ReviewLibrary brandCode={brandCode} />}
      {tab === 'products' && <BrandProducts brandId={brandId} brandCode={brandCode} />}
      {tab === 'contracts' && (
        <BrandContracts brandId={brandId} brandCode={brandCode} />
      )}
    </div>
  );
};

export default BrandProfile;
