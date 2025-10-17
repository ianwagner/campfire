import React from 'react';
import { useParams } from 'react-router-dom';
import BrandProfile from './BrandProfile.jsx';

const OpsBrandProfile = () => {
  const { id } = useParams();
  return <BrandProfile brandId={id} backPath="/ops/contracts" />;
};

export default OpsBrandProfile;
