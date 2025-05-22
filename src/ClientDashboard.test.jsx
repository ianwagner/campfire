import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientDashboard from './ClientDashboard';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));

const getDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  getDocs: (...args) => getDocs(...args),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const groupSnapshot = {
  docs: [
    {
      id: 'g1',
      data: () => ({
        name: 'Group 1',
        brandCode: 'BR1',
        createdAt: { toDate: () => new Date('2023-12-01') },
      }),
    },
    {
      id: 'g2',
      data: () => ({
        name: 'Group 2',
        brandCode: 'BR1',
        createdAt: { toDate: () => new Date('2023-12-01') },
      }),
    },
  ],
};

const assets = {
  g1: {
    docs: [
      {
        data: () => ({
          firebaseUrl: 'thumb1.jpg',
          status: 'pending',
          lastUpdatedAt: { toDate: () => new Date('2024-01-10') },
        }),
      },
    ],
  },
  g2: {
    docs: [
      {
        data: () => ({
          firebaseUrl: 'thumb2.jpg',
          status: 'approved',
          lastUpdatedAt: { toDate: () => new Date('2023-12-20') },
        }),
      },
    ],
  },
};

beforeEach(() => {
  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col.length === 2) {
      return Promise.resolve(groupSnapshot);
    }
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assets[col[2]]);
    }
    return Promise.resolve({ docs: [] });
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('navigates to review on card click', async () => {
  render(
    <MemoryRouter>
      <ClientDashboard
        user={{ uid: 'u1', metadata: { lastSignInTime: '2024-01-05T00:00:00Z' } }}
        brandCodes={['BR1']}
      />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByTestId('group-card-g1'));

  fireEvent.click(screen.getByTestId('group-card-g1'));

  expect(mockNavigate).toHaveBeenCalledWith('/review/g1');
});

test('shows only new groups when toggled', async () => {
  render(
    <MemoryRouter>
      <ClientDashboard
        user={{ uid: 'u1', metadata: { lastSignInTime: '2024-01-05T00:00:00Z' } }}
        brandCodes={['BR1']}
      />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByTestId('group-card-g1'));

  expect(screen.getAllByTestId(/group-card/)).toHaveLength(2);

  fireEvent.click(screen.getByLabelText('Show new only'));

  expect(screen.getByTestId('group-card-g1')).toBeInTheDocument();
  expect(screen.queryByTestId('group-card-g2')).toBeNull();
});
