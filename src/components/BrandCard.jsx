import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const BrandCard = ({ brand, showCredits = false }) => {
  const logo = Array.isArray(brand.logos) && brand.logos.length > 0 ? brand.logos[0] : null;
  return (
    <div className="border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] overflow-hidden text-center">
      {logo && (
        <OptimizedImage
          pngUrl={logo}
          alt={`${brand.code} logo`}
          className="w-full h-32 object-contain border-b border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-white"
        />
      )}
        <p className="p-2 font-medium text-gray-700 dark:text-gray-300 mb-0">{brand.code}</p>
        {showCredits && (
          <p
            className={`pb-2 text-sm ${
              brand.credits < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            {brand.credits} credits
          </p>
        )}
    </div>
  );
};

export default BrandCard;
