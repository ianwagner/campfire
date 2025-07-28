import React from 'react';
import { useParams, Link } from 'react-router-dom';
import BrandContracts from './BrandContracts.jsx';

const OpsBrandContracts = () => {
  const { id } = useParams();
  return (
    <div className="min-h-screen p-4">
      <div className="flex items-center mb-2">
        <Link to="/ops/contracts" className="btn-arrow mr-2" aria-label="Back">
          &lt;
        </Link>
        <h1 className="text-2xl mb-0">Contracts</h1>
      </div>
      <BrandContracts brandId={id} />
    </div>
  );
};

export default OpsBrandContracts;
