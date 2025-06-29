import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import BrandSetup from './BrandSetup';
import AssetLibrary from './AssetLibrary.jsx';
import TaggerModal from './TaggerModal.jsx';

const BrandProfile = ({ brandId: propId = null }) => {
  const { id } = useParams();
  const brandId = propId || id || null;
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandCode, setBrandCode] = useState('');
  const [tab, setTab] = useState('setup');
  const [taggerOpen, setTaggerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (brandId) {
        try {
          const snap = await getDoc(doc(db, 'brands', brandId));
          if (snap.exists()) setBrandCode(snap.data().code || '');
        } catch (err) {
          console.error('Failed to load brand', err);
        }
      } else if (brandCodes.length > 0) {
        setBrandCode(brandCodes[0]);
      }
    };
    load();
  }, [brandId, brandCodes]);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Brand Profile</h1>
      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => setTab('setup')}
          className={`btn-secondary bg-transparent px-3 py-1 ${tab === 'setup' ? 'bg-accent-10 text-accent' : ''}`}
        >
          Brand Setup
        </button>
        <button
          onClick={() => setTab('library')}
          className={`btn-secondary bg-transparent px-3 py-1 ${tab === 'library' ? 'bg-accent-10 text-accent' : ''}`}
        >
          Asset Library
        </button>
      </div>
      {tab === 'setup' && <BrandSetup brandId={brandId} />}
      {tab === 'library' && (
        <>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setTaggerOpen(true)}
              className="btn-secondary px-3 py-1"
            >
              Tag Drive Folder
            </button>
          </div>
          <AssetLibrary brandCode={brandCode} />
        </>
      )}
      {taggerOpen && (
        <TaggerModal brandCode={brandCode} onClose={() => setTaggerOpen(false)} />
      )}
    </div>
  );
};

export default BrandProfile;
