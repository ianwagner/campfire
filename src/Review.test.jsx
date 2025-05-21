import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    docs: [{ id: 'batch1', data: () => ({ brandCode: 'BR1' }) }],
  };
  const adsSnapshot = {
    docs: [{ id: 'ad1', data: () => ({ adUrl: 'url1' }) }],
  };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1' }) }],
  };
  const assetSnapshot = {
    docs: [{ id: 'asset1', data: () => ({ firebaseUrl: 'url2' }) }],
  };

  getDocs
    .mockResolvedValueOnce(batchSnapshot)
    .mockResolvedValueOnce(adsSnapshot)
    .mockResolvedValueOnce(groupSnapshot)
    .mockResolvedValueOnce(assetSnapshot);

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );
});

test('shows group summary after reviewing ads', async () => {
  const batchSnapshot = { docs: [] };
  const groupSnapshot = {
    docs: [
      { id: 'g1', data: () => ({ brandCode: 'BR1', name: 'Group 1' }) },
    ],
  };
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'thumb1', adGroupId: 'g1' }) },
    ],
  };

  getDocs
    .mockResolvedValueOnce(batchSnapshot)
    .mockResolvedValueOnce(groupSnapshot)
    .mockResolvedValueOnce(assetSnapshot);

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => screen.getByRole('img'));

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => screen.getByText('Group 1'));
  expect(screen.getByText('Group 1')).toBeInTheDocument();
  expect(screen.getByText(/Approved: 1/)).toBeInTheDocument();
});
