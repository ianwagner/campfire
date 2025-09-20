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
  where,
} from 'firebase/firestore';

beforeEach(() => {
  jest.clearAllMocks();
  getDocs.mockReset();
  onSnapshot.mockReset();
  where.mockReset();
  doc.mockReset();
  updateDoc.mockReset();
});

const queueGetDocs = (...responses) => {
  const queue = [...responses, ...responses];
  getDocs.mockImplementation(() =>
    Promise.resolve(queue.shift() ?? responses[responses.length - 1] ?? { docs: [] })
  );
};

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
  const adUnitSnap = { docs: [] };
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
  queueGetDocs(brandSnap, previewSnap, brandSnap, adUnitSnap, assetSnap);
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

test('uses ad unit data when available', async () => {
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
  const adUnitSnap = {
    docs: [
      { data: () => ({ status: 'approved', firebaseUrl: 'u1' }) },
      { data: () => ({ status: 'rejected', firebaseUrl: 'u2' }) },
    ],
  };
  const brandSnap = {
    docs: [{ data: () => ({ credits: 0, code: 'B1', logos: ['logo.png'] }) }],
  };
  doc.mockImplementation((...args) => args.slice(1).join('/'));
  queueGetDocs(brandSnap, previewSnap, brandSnap, adUnitSnap);
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

  queueGetDocs(brandSnap);
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
          visibility: 'public',
          name: 'Group 1',
        }),
      },
    ],
  };
  const previewSnap = { docs: [] };
  const adUnitSnap = { docs: [] };
  const assetSnap = { docs: [] };
  const brandSnap = {
    docs: [{ data: () => ({ credits: 0, code: 'B1', logos: ['logo.png'] }) }],
  };
  doc.mockImplementation((...args) => args.slice(1).join('/'));
  queueGetDocs(brandSnap, previewSnap, brandSnap, adUnitSnap, assetSnap);
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

test('chunks brand queries when more than 10 brand codes are provided', async () => {
  const brandCodes = Array.from({ length: 12 }, (_, i) => `B${i + 1}`);
  const makeBrandDocs = (codes) =>
    codes.map((code) => ({
      data: () => ({ credits: 1, code, logos: [`${code}-logo`] }),
    }));
  const makePreviewSnap = (groupId) => ({
    docs: [
      {
        id: `${groupId}-asset`,
        data: () => ({
          firebaseUrl: `${groupId}-url`,
          status: 'approved',
          aspectRatio: '1x1',
        }),
      },
    ],
  });
  const adUnitSnap = {
    docs: [{ data: () => ({ status: 'approved', firebaseUrl: 'unit' }) }],
  };

  doc.mockImplementation((...args) => args.slice(1).join('/'));
  queueGetDocs(
    { docs: makeBrandDocs(brandCodes.slice(0, 10)) },
    { docs: makeBrandDocs(brandCodes.slice(10)) },
    makePreviewSnap('g1'),
    adUnitSnap,
    makePreviewSnap('g2'),
    adUnitSnap
  );

  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'g1',
            data: () => ({
              brandCode: 'B1',
              status: 'ready',
              visibility: 'public',
              name: 'Group 1',
            }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'g2',
            data: () => ({
              brandCode: 'B11',
              status: 'ready',
              visibility: 'public',
              name: 'Group 2',
            }),
          },
        ],
      });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientDashboard user={{ uid: 'u1', metadata: {} }} brandCodes={brandCodes} />
    </MemoryRouter>
  );

  expect(await screen.findByText('Group 1')).toBeInTheDocument();
  expect(screen.getByText('Group 2')).toBeInTheDocument();

  const brandWhereCalls = where.mock.calls.filter(
    (call) => call[0] === 'brandCode' && call[1] === 'in'
  );
  expect(brandWhereCalls).toHaveLength(2);
  expect(brandWhereCalls[0][2]).toEqual(brandCodes.slice(0, 10));
  expect(brandWhereCalls[1][2]).toEqual(brandCodes.slice(10));
});
