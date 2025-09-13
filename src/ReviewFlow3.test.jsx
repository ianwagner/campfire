import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewFlow3 from './ReviewFlow3.jsx';

jest.mock('./components/OptimizedImage.jsx', () => (props) => <img {...props} />);
jest.mock('./components/VideoPlayer.jsx', () => (props) => <video {...props} />);
jest.mock('./utils/isVideoUrl', () => (url) => url.endsWith('.mp4'));

test('assets use 2.0 sizing constraints', () => {
  const groups = [
    { recipeCode: 'r1', assets: [{ firebaseUrl: 'a.png', filename: 'a.png' }] },
  ];
  const { container } = render(<ReviewFlow3 groups={groups} />);
  const wrapper = container.querySelector('.max-w-\\[300px\\]');
  expect(wrapper).toBeInTheDocument();
});

test('initial status comes from group', () => {
  const groups = [
    {
      recipeCode: 'r1',
      status: 'approved',
      assets: [{ firebaseUrl: 'a.png', filename: 'a.png' }],
    },
  ];
  render(<ReviewFlow3 groups={groups} />);
  const select = screen.getByRole('combobox');
  expect(select).toHaveValue('approved');
});
