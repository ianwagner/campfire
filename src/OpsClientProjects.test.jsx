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

import { getDocs, onSnapshot, updateDoc } from 'firebase/firestore';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import OpsClientProjects from './OpsClientProjects';

afterEach(() => jest.clearAllMocks());

test('refresh button updates project status', async () => {
  useUserRole.mockReturnValue({ agencyId: 'a1' });
  useAgencies.mockReturnValue({ agencies: [] });

  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'c1',
          data: () => ({ fullName: 'Client 1' }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        { id: 'a1', data: () => ({ status: 'ready' }) },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        { id: 'r1', data: () => ({}) },
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
            data: () => ({ name: 'Proj1', brandCode: 'B1', status: 'briefed' }),
          },
        ],
      });
      return jest.fn();
    });

  updateDoc.mockResolvedValue();

  render(<OpsClientProjects />);

  await screen.findByText('Client 1');

  fireEvent.click(screen.getByText('Client 1'));

  const row = (await screen.findByText('Proj1')).closest('li');
  expect(within(row).getByText('briefed')).toBeInTheDocument();

  fireEvent.click(within(row).getByText('Refresh'));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  await waitFor(() => expect(within(row).getByText('ready')).toBeInTheDocument());
});

test('admin can select agency to view client projects', async () => {
  useUserRole.mockReturnValue({ agencyId: null });
  useAgencies.mockReturnValue({ agencies: [{ id: 'a1', name: 'Agency 1' }] });

  getDocs.mockResolvedValueOnce({
    docs: [
      {
        id: 'c1',
        data: () => ({ fullName: 'Client 1' }),
      },
    ],
  });

  render(<OpsClientProjects />);

  fireEvent.change(screen.getByLabelText('Agency'), { target: { value: 'a1' } });

  await screen.findByText('Client 1');
});

