import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductEditModal from './ProductEditModal.jsx';

describe('ProductEditModal', () => {
  const product = { name: 'Test', url: '', description: [], benefits: [], images: [] };

  test('calls onDelete after confirmation', () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    window.confirm = jest.fn(() => true);
    render(
      <ProductEditModal
        product={product}
        brandCode="b"
        onSave={jest.fn()}
        onDelete={onDelete}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(window.confirm).toHaveBeenCalledWith('Delete this product?');
    expect(onDelete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
