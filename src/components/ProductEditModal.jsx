import React, { useState } from 'react';
import ScrollableModal from './ScrollableModal.jsx';
import FormField from './FormField.jsx';
import TagInput from './TagInput.jsx';
import Button from './Button.jsx';
import ProductGalleryModal from './ProductGalleryModal.jsx';

const ProductEditModal = ({ product, brandCode = '', onSave, onClose }) => {
  const [local, setLocal] = useState(product);
  const [showGallery, setShowGallery] = useState(false);

  const update = (changes) => setLocal((p) => ({ ...p, ...changes }));

  return (
    <ScrollableModal
      header={(
        <>
          <h3 className="text-lg font-semibold">Edit Product</h3>
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </>
      )}
      sizeClass="max-w-lg w-full"
    >
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
      <div className="text-right space-x-2 mt-2">
        <Button type="button" variant="secondary" className="px-3 py-1" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          variant="primary"
          className="px-3 py-1"
          onClick={() => {
            onSave && onSave(local);
            onClose();
          }}
        >
          Save
        </Button>
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
    </ScrollableModal>
  );
};

export default ProductEditModal;
