import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Review from './Review';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  getDocs: (...args) => getDocs(...args),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('loads ads from subcollections', async () => {
  const batchSnapshot = {
    docs: [
      { id: 'batch1', data: () => ({ brandCode: 'BR1' }) },
    ],
  };
  const adsSnapshot = {
    docs: [
      { id: 'ad1', data: () => ({ adUrl: 'url1' }) },
    ],
  };
  getDocs.mockResolvedValueOnce(batchSnapshot).mockResolvedValueOnce(adsSnapshot);

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'url1'));
});
