import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const AgencyCard = ({ agency }) => {
  const name = agency.name || agency.id;
  const description = agency.description || agency.tagline || null;

  return (
    <div className="group h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md focus-within:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      {agency.logoUrl && (
        <OptimizedImage
          pngUrl={agency.logoUrl}
          alt={`${name} logo`}
          className="h-32 w-full border-b border-gray-200 bg-white object-contain p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
        />
      )}
      <div className="space-y-2 p-4 text-center">
        <p className="text-base font-semibold text-gray-800 transition-colors group-hover:text-[var(--accent-color)] dark:text-gray-100 dark:group-hover:text-[var(--accent-color)]">
          {name}
        </p>
        {description ? (
          <p className="text-sm text-gray-500 transition-colors dark:text-gray-400">
            {description}
          </p>
        ) : (
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 transition-colors dark:text-gray-400">
            {agency.id}
          </p>
        )}
      </div>
    </div>
  );
};

export default AgencyCard;
