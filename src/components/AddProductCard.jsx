import React from 'react';
import { FiPlus } from 'react-icons/fi';
import { FaMagic } from 'react-icons/fa';
import IconButton from './IconButton.jsx';

const AddProductCard = ({ onAdd, onImport }) => (
  <div className="border rounded shadow bg-white dark:bg-[var(--dark-sidebar-bg)] flex flex-col items-center justify-center gap-1 p-2 h-24">
    {onImport && (
      <IconButton aria-label="Import Product" onClick={onImport}>
        <FaMagic />
      </IconButton>
    )}
    {onAdd && (
      <IconButton aria-label="Add Product" onClick={onAdd}>
        <FiPlus />
      </IconButton>
    )}
  </div>
);

export default AddProductCard;

