import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const isUrl = (str) => /^https?:\/\//i.test(str || '');

const RecipeTypeCard = ({
  type,
  onClick,
  selected = false,
  className = '',
  size = 'base',
}) => {
  const sizeClasses = size === 'small' ? 'p-2 w-16' : 'p-4 w-full';
  const iconClasses = size === 'small' ? 'w-8 h-8' : 'w-16 h-16';
  const iconContainerClasses =
    size === 'small' ? 'mb-1 gap-1' : 'mb-2 gap-2';
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
      {(() => {
        const urls = Array.isArray(type.iconUrls)
          ? type.iconUrls
          : Array.isArray(type.iconUrl)
          ? type.iconUrl
          : type.iconUrl
          ? [type.iconUrl]
          : [];
        return urls.length > 0 ? (
          <div
            className={`flex flex-wrap justify-center ${iconContainerClasses}`}
          >
            {urls.map((url, idx) => {
              if (isUrl(url)) {
                return (
                  <OptimizedImage
                    key={idx}
                    pngUrl={url}
                    alt={`${type.name} icon ${idx + 1}`}
                    className={`${iconClasses} object-contain`}
                  />
                );
              }
              return (
                <div
                  key={idx}
                  className={`${iconClasses} bg-gray-200 rounded`}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        ) : null;
      })()}
      <p
        className={`font-medium text-gray-700 dark:text-gray-300 mb-0 ${textClasses}`}
      >
        {type.name}
      </p>
      {type.description && size !== 'small' && (
        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 mb-0">
          {type.description}
        </p>
      )}
    </button>
  );
};

export default RecipeTypeCard;
