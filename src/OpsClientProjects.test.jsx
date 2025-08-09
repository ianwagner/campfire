import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpsClientProjects from './OpsClientProjects';

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

jest.mock('./useUserRole', () => () => ({ agencyId: 'a1' }));

import { getDocs, onSnapshot } from 'firebase/firestore';

afterEach(() => jest.clearAllMocks());

test('project shows ad group status after refresh', async () => {
  getDocs.mockResolvedValueOnce({
    docs: [
      {
        id: 'c1',
        data: () => ({ fullName: 'Client 1' }),
      },
    ],
  });

  const groupCallbacks = [];
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
      groupCallbacks.push(cb);
      cb({ docs: [] });
      return jest.fn();
    });

  render(<OpsClientProjects />);

  await screen.findByText('Client 1');

  fireEvent.click(screen.getByText('Client 1'));

  const row = (await screen.findByText('Proj1')).closest('li');
  expect(within(row).getByText('B1')).toBeInTheDocument();
  expect(within(row).getByText('briefed')).toBeInTheDocument();

  groupCallbacks[0]({
    docs: [
      {
        id: 'g1',
        data: () => ({ name: 'Proj1', brandCode: 'B1', status: 'ready' }),
      },
    ],
  });

  await waitFor(() => expect(within(row).getByText('ready')).toBeInTheDocument());
});

