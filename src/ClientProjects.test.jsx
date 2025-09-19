import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientProjects from './ClientProjects';

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  Timestamp: { fromDate: jest.fn() },
  updateDoc: jest.fn(),
}));

jest.mock('./useSiteSettings', () => jest.fn(() => ({ settings: {}, loading: false })));
jest.mock('./useUserRole', () => () => ({ agencyId: null }));
jest.mock('./useAgencyTheme', () => () => ({ agency: {} }));
jest.mock('./RecipePreview.jsx', () => () => <div />);
jest.mock('./DescribeProjectModal.jsx', () => () => <div />);
jest.mock('./components/OptimizedImage.jsx', () => () => <div />);
jest.mock('./uploadFile.js', () => ({ uploadFile: jest.fn() }));

import { onSnapshot } from 'firebase/firestore';
import { auth } from './firebase/config';
import useSiteSettings from './useSiteSettings';

afterEach(() => {
  jest.clearAllMocks();
  delete auth.currentUser.displayName;
});

test('displays brand code when multiple brand codes provided', () => {
  const now = new Date();
  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'g1',
            data: () => ({
              name: 'Launch Campaign',
              brandCode: 'B1',
              status: 'ready',
              createdAt: { toDate: () => now },
              recipeCount: 4,
              month: '2024-02',
            }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1', 'B2']} />
    </MemoryRouter>
  );

  expect(screen.getByText('Launch Campaign')).toBeInTheDocument();
  expect(screen.getByText('B1')).toBeInTheDocument();
});

test('toggle shows archived ad groups', () => {
  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'g1',
            data: () => ({
              name: 'Active Group',
              brandCode: 'B1',
              status: 'ready',
            }),
          },
          {
            id: 'g2',
            data: () => ({
              name: 'Archived Group',
              brandCode: 'B1',
              status: 'archived',
            }),
          },
        ],
      });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  expect(screen.getByText('Active Group')).toBeInTheDocument();
  expect(screen.queryByText('Archived Group')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('Archived'));

  expect(screen.getByText('Archived Group')).toBeInTheDocument();
  expect(screen.queryByText('Active Group')).not.toBeInTheDocument();
});

test('shows personalized greeting when display name is present', () => {
  auth.currentUser.displayName = 'Jane Smith';
  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  expect(
    screen.getByText('Hey Jane, how would you like to start?')
  ).toBeInTheDocument();
});

test('renders month pill with custom color', () => {
  useSiteSettings.mockReturnValue({
    settings: { monthColors: { '02': { color: '#123456', opacity: 1 } } },
    loading: false,
  });
  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'g1',
            data: () => ({
              name: 'Seasonal',
              brandCode: 'B1',
              status: 'ready',
              month: '2024-02',
            }),
          },
        ],
      });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  const monthPill = screen.getByText('Feb');
  expect(monthPill).toHaveClass('tag-pill');
  expect(monthPill).toHaveStyle('background-color: #123456');
});

test('shows default greeting when display name is absent', () => {
  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  expect(
    screen.getByText('How would you like to start?')
  ).toBeInTheDocument();
});
