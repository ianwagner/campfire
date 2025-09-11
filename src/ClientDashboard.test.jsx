import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientDashboard from './ClientDashboard';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  onSnapshot: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  limit: jest.fn((n) => n),
}));
jest.mock('./useSiteSettings', () =>
  jest.fn(() => ({ settings: { monthColors: {}, tagStrokeWeight: 1 }, loading: false }))
);

import {
  collection,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';

beforeEach(() => {
  jest.clearAllMocks();
});

test('computes summary for groups missing data', async () => {
  const groupSnap = {
    docs: [
      {
        id: 'g1',
        data: () => ({
          brandCode: 'B1',
          status: 'ready',
          visibility: 'private',
          name: 'Group 1',
        }),
      },
    ],
  };
  const previewSnap = { docs: [] };
  const assetSnap = {
    docs: [
      {
        data: () => ({
          firebaseUrl: 'url1',
          status: 'approved',
          filename: 'B1_G1_1_1x1_V1.png',
          aspectRatio: '1x1',
        }),
      },
      {
        data: () => ({
          firebaseUrl: 'url2',
          status: 'rejected',
          filename: 'B1_G1_2_1x1_V1.png',
          aspectRatio: '1x1',
        }),
      },
    ],
  };
  const brandSnap = {
    docs: [{ data: () => ({ credits: 0, code: 'B1', logos: ['logo.png'] }) }],
  };
  doc.mockImplementation((...args) => args.slice(1).join('/'));
  getDocs
    .mockResolvedValueOnce(brandSnap)
    .mockResolvedValueOnce(previewSnap)
    .mockResolvedValueOnce(assetSnap);
  onSnapshot.mockImplementation((q, cb) => {
    cb(groupSnap);
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <ClientDashboard user={{ uid: 'u1', metadata: {} }} brandCodes={['B1']} />
    </MemoryRouter>
  );

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  expect(updateDoc).toHaveBeenCalledWith(
    'adGroups/g1',
    expect.objectContaining({ approvedCount: 1, rejectedCount: 1 })
  );
});

test('shows warning when credits are negative', async () => {
  const brandSnap = {
    docs: [{ data: () => ({ credits: -5, code: 'B1', logos: ['l.png'] }) }],
  };

  getDocs.mockResolvedValueOnce(brandSnap);
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs: [] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <ClientDashboard user={{ uid: 'u1', metadata: {} }} brandCodes={['B1']} />
    </MemoryRouter>
  );

  expect(
    await screen.findByText(/credit balance is negative/i)
  ).toBeInTheDocument();
});

test('renders brand logo with default styling and no status badge', async () => {
  const groupSnap = {
    docs: [
      {
        id: 'g1',
        data: () => ({
          brandCode: 'B1',
          status: 'pending',
          visibility: 'private',
          name: 'Group 1',
        }),
      },
    ],
  };
  const previewSnap = { docs: [] };
  const assetSnap = { docs: [] };
  const brandSnap = {
    docs: [{ data: () => ({ credits: 0, code: 'B1', logos: ['logo.png'] }) }],
  };
  doc.mockImplementation((...args) => args.slice(1).join('/'));
  getDocs
    .mockResolvedValueOnce(brandSnap)
    .mockResolvedValueOnce(previewSnap)
    .mockResolvedValueOnce(assetSnap);
  onSnapshot.mockImplementation((q, cb) => {
    cb(groupSnap);
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <ClientDashboard user={{ uid: 'u1', metadata: {} }} brandCodes={['B1']} />
    </MemoryRouter>
  );

  const img = await screen.findByAltText('Group 1');
  const container = img.closest('div');
  expect(container).toHaveStyle('background: #efefef; padding: 40px');
  expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
});
