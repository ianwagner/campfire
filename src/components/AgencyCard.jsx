import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';
import { DEFAULT_LOGO_URL } from '../constants';

const AgencyCard = ({ agency }) => (
  <div className="border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] overflow-hidden text-center">
    <OptimizedImage
      pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
      alt={`${agency.name || agency.id} logo`}
      className="w-full h-32 object-contain border-b border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-white"
    />
    <p className="p-2 font-medium text-gray-700 dark:text-gray-300 mb-2">
      {agency.name || agency.id}
    </p>
  </div>
);

export default AgencyCard;
