import React from 'react';
import { useParams } from 'react-router-dom';
import BrandContracts from './BrandContracts.jsx';

const OpsBrandContracts = () => {
  const { id } = useParams();
  return (
    <div className="min-h-screen p-4">
      <BrandContracts brandId={id} />
    </div>
  );
};

export default OpsBrandContracts;
