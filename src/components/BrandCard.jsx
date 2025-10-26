import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import getPrimaryLogoUrl from '../utils/getPrimaryLogoUrl.js';

const BrandCard = ({ brand }) => {
  const logo = getPrimaryLogoUrl(brand.logos) || brand.logoUrl || null;
  const name = brand.name || brand.displayName || brand.code;

  return (
    <div className="group h-full rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md focus-within:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] overflow-hidden">
      {logo && (
        <OptimizedImage
          pngUrl={logo}
          alt={`${brand.code} logo`}
          className="w-full h-32 object-contain border-b border-gray-200 bg-white p-4 dark:border-[var(--border-color-default)] dark:bg-white"
        />
      )}
      <div className="p-4 text-center">
        <p className="mb-1 text-base font-semibold text-gray-800 transition-colors group-hover:text-[var(--accent-color)] dark:text-gray-100 dark:group-hover:text-[var(--accent-color)]">
          {name}
        </p>
        <p className="mb-0 text-sm font-medium uppercase tracking-wide text-gray-500 transition-colors dark:text-gray-400">
          {brand.code}
        </p>
      </div>
    </div>
  );
};

export default BrandCard;
