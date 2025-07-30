import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const RecipeTypeCard = ({ type, onClick, selected = false, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] overflow-hidden text-center p-4 flex flex-col items-center w-full ${
      selected ? 'border-accent' : ''
    } ${className}`}
  >
    {type.iconUrl && (
      <OptimizedImage
        pngUrl={type.iconUrl}
        alt={`${type.name} icon`}
        className="w-16 h-16 object-contain mb-2"
      />
    )}
    <p className="font-medium text-gray-700 dark:text-gray-300 mb-0">{type.name}</p>
  </button>
);

export default RecipeTypeCard;
