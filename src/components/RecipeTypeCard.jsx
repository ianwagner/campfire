import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const RecipeTypeCard = ({
  type,
  onClick,
  selected = false,
  className = '',
  size = 'base',
}) => {
  const sizeClasses =
    size === 'small' ? 'p-2 w-16' : 'p-4 w-full';
  const iconClasses =
    size === 'small' ? 'w-8 h-8 mb-1' : 'w-16 h-16 mb-2';
  const textClasses = size === 'small' ? 'text-xs' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] overflow-hidden text-center flex flex-col items-center ${sizeClasses} ${
        selected ? 'border-accent' : ''
      } ${className}`}
    >
      {type.iconUrl && (
        <OptimizedImage
          pngUrl={type.iconUrl}
          alt={`${type.name} icon`}
          className={`${iconClasses} object-contain`}
        />
      )}
      <p
        className={`font-medium text-gray-700 dark:text-gray-300 mb-0 ${textClasses}`}
      >
        {type.name}
      </p>
    </button>
  );
};

export default RecipeTypeCard;
