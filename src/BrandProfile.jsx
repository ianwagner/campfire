import React, { useState } from 'react';
import BrandSetup from './BrandSetup';
import AssetLibrary from './AssetLibrary.jsx';

const BrandProfile = () => {
  const [tab, setTab] = useState('setup');

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
      {tab === 'setup' && <BrandSetup />}
      {tab === 'library' && <AssetLibrary />}
    </div>
  );
};

export default BrandProfile;
