import React, { useState } from 'react';
import ScrollModal from './ScrollModal.jsx';
import FormField from './FormField.jsx';
import TagInput from './TagInput.jsx';
import Button from './Button.jsx';
import SaveButton from './SaveButton.jsx';
import CloseButton from './CloseButton.jsx';
import ProductGalleryModal from './ProductGalleryModal.jsx';
import IconButton from './IconButton.jsx';
import { FiTrash } from 'react-icons/fi';

const ProductEditModal = ({ product, brandCode = '', onSave, onClose, onDelete }) => {
  const [local, setLocal] = useState(product);
  const [showGallery, setShowGallery] = useState(false);

  const update = (changes) => setLocal((p) => ({ ...p, ...changes }));

  const dirty = JSON.stringify(local) !== JSON.stringify(product);

  const handleSave = () => {
    onSave && onSave(local);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('Delete this product?')) {
      onDelete && onDelete();
      onClose();
    }
  };

  return (
    <ScrollModal
      sizeClass="max-w-lg w-full"
      header={
        <div className="flex items-center justify-between p-2">
          <h3 className="text-lg font-semibold mb-0">Edit Product</h3>
          <div className="flex items-center gap-2">
            {onDelete && (
              <IconButton aria-label="Delete" onClick={handleDelete} className="text-red-600">
                <FiTrash />
              </IconButton>
            )}
            <SaveButton onClick={handleSave} canSave={dirty} />
            <CloseButton onClick={onClose} />
          </div>
        </div>
      }
    >
      <div className="space-y-2 p-2">
        <FormField label="Name">
        <input
          type="text"
          value={local.name}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full p-2 border rounded"
        />
      </FormField>
      <FormField label="Description">
        <TagInput value={local.description} onChange={(arr) => update({ description: arr })} />
      </FormField>
      <FormField label="Benefits">
        <TagInput value={local.benefits} onChange={(arr) => update({ benefits: arr })} />
      </FormField>
      <FormField label="Featured Image">
        {local.featuredImage && (
          <img src={local.featuredImage} alt="featured" className="h-24 w-auto mb-2" />
        )}
        <Button type="button" variant="secondary" className="px-2 py-1" onClick={() => setShowGallery(true)}>
          See Images
        </Button>
      </FormField>
      </div>
      {showGallery && (
        <ProductGalleryModal
          brandCode={brandCode}
          productName={local.name}
          featured={local.featuredImage}
          onSelect={(url) => {
            update({ featuredImage: url });
            setShowGallery(false);
          }}
          onClose={() => setShowGallery(false)}
        />
      )}
    </ScrollModal>
  );
};

export default ProductEditModal;
