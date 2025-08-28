import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'ops1' } },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  orderBy: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

jest.mock('./useUserRole', () => jest.fn());
jest.mock('./useAgencies', () => jest.fn());
jest.mock('./useSiteSettings', () =>
  jest.fn(() => ({ settings: { monthColors: {}, tagStrokeWeight: 1 }, loading: false }))
);

import { getDocs, onSnapshot } from 'firebase/firestore';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import OpsClientProjects from './OpsClientProjects';

afterEach(() => jest.clearAllMocks());

test('shows month and ad count tags for projects', async () => {
  useUserRole.mockReturnValue({ agencyId: 'a1' });
  useAgencies.mockReturnValue({ agencies: [] });

  getDocs.mockResolvedValueOnce({
    docs: [
      { id: 'c1', data: () => ({ fullName: 'Client 1' }) },
    ],
  });

  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'p1',
            data: () => ({
              title: 'Proj1',
              brandCode: 'B1',
              status: 'briefed',
              month: '2024-02',
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
            id: 'g1',
            data: () => ({ name: 'Proj1', brandCode: 'B1', recipeCount: 2 }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          { id: 'r1', data: () => ({ projectId: 'p1', numAds: 3 }) },
        ],
      });
      return jest.fn();
    });

  render(<OpsClientProjects />);

  await screen.findByText('Client 1');
  fireEvent.click(screen.getByText('Client 1'));

  await screen.findByText('Proj1');
  await screen.findByText('2');
  const row = (await screen.findByText('Proj1')).closest('li');
  expect(within(row).getByText('2')).toBeInTheDocument();
  expect(within(row).getByText('Feb')).toBeInTheDocument();
});

test('need info status shows info note on hover', async () => {
  useUserRole.mockReturnValue({ agencyId: 'a1' });
  useAgencies.mockReturnValue({ agencies: [] });

  getDocs.mockResolvedValueOnce({
    docs: [
      { id: 'c1', data: () => ({ fullName: 'Client 1' }) },
    ],
  });

  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'p1',
            data: () => ({ title: 'Proj1', status: 'need info' }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'r1',
            data: () => ({ projectId: 'p1', infoNote: 'Need assets' }),
          },
        ],
      });
      return jest.fn();
    });

  render(<OpsClientProjects />);

  await screen.findByText('Client 1');
  fireEvent.click(screen.getByText('Client 1'));

  await screen.findByText('Proj1');
  const row = (await screen.findByText('Proj1')).closest('li');
  const statusTag = within(row).getByText(/need info/i);
  expect(statusTag).toHaveAttribute('title', 'Need assets');
});

