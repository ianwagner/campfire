import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import getPrimaryLogoUrl from '../utils/getPrimaryLogoUrl.js';

const BrandCard = ({ brand }) => {
  const logo = getPrimaryLogoUrl(brand.logos) || brand.logoUrl || null;
  const name = brand.name || brand.displayName || brand.code;

  return (
    <div className="border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] overflow-hidden">
      {logo && (
        <OptimizedImage
          pngUrl={logo}
          alt={`${brand.code} logo`}
          className="w-full h-32 object-contain border-b border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-white"
        />
      )}
      <div className="p-4 text-center">
        <p className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">{name}</p>
        <p className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0">
          {brand.code}
        </p>
      </div>
    </div>
  );
};

export default BrandCard;
