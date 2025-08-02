import React from 'react';
import OptimizedImage from './OptimizedImage.jsx';

const ProductCard = ({ product, onClick, selected = false }) => {
  const img = product.featuredImage ||
    (Array.isArray(product.images) && product.images.length
      ? product.images[0].url || product.images[0]
      : '');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] overflow-hidden text-center ${selected ? 'ring-2 ring-blue-500' : ''}`}
    >
      {img && (
        <OptimizedImage
          pngUrl={img}
          alt={product.name}
          className="w-full h-32 object-contain border-b border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-white"
        />
      )}
      <p className="p-2 font-medium text-gray-700 dark:text-gray-300 mb-0">
        {product.name || 'Untitled'}
      </p>
    </button>
  );
};

export default ProductCard;
