import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GalleryModal from './components/GalleryModal.jsx';

jest.mock('./components/OptimizedImage.jsx', () => (props) => (
  <img {...props} />
));

jest.mock('./components/VideoPlayer.jsx', () => (props) => (
  <video {...props} />
));

test('renders ads and handles close', () => {
  const ads = [{ firebaseUrl: 'img1.png', filename: 'img1.png' }];
  const onClose = jest.fn();
  render(<GalleryModal ads={ads} onClose={onClose} />);
  expect(screen.getByAltText('img1.png')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
