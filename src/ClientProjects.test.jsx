import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientProjects from './ClientProjects';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-1', displayName: 'Client Tester' } },
}));

const mockOnSnapshot = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

jest.mock('./components/OptimizedImage.jsx', () => (props) => (
  <img alt={props.alt || 'artwork'} />
));

jest.mock('./useSiteSettings', () =>
  jest.fn(() => ({
    settings: {
      artworkUrl: 'hero.jpg',
      monthColors: {},
      tagStrokeWeight: 1,
    },
    loading: false,
  }))
);

jest.mock('./useAgencyTheme', () =>
  jest.fn(() => ({
    agency: {},
    loading: false,
  }))
);

jest.mock('./useUserRole', () =>
  jest.fn(() => ({
    agencyId: 'agency-1',
  }))
);

const flushSnapshot = (docs) => {
  mockOnSnapshot.mockImplementationOnce((q, cb) => {
    cb({
      docs: docs.map((doc) => ({
        id: doc.id,
        data: () => doc.data,
      })),
    });
    return jest.fn();
  });
};

describe('ClientProjects', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockOnSnapshot.mockReset();
  });

  test('shows ad groups for assigned brands', async () => {
    flushSnapshot([
      {
        id: 'g1',
        data: {
          name: 'Launch Campaign',
          brandCode: 'B1',
          status: 'ready',
          lastUpdated: { toDate: () => new Date('2024-04-01T12:00:00Z') },
          month: '202405',
          approvedCount: 2,
          readyCount: 1,
        },
      },
    ]);

    render(
      <MemoryRouter>
        <ClientProjects brandCodes={['B1']} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Launch Campaign')).toBeInTheDocument();
    });
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('toggle shows archived ad groups', async () => {
    flushSnapshot([
      {
        id: 'g1',
        data: {
          name: 'Active Group',
          brandCode: 'B1',
          status: 'ready',
          lastUpdated: { toDate: () => new Date('2024-05-01T12:00:00Z') },
          approvedCount: 1,
        },
      },
      {
        id: 'g2',
        data: {
          name: 'Archived Group',
          brandCode: 'B1',
          status: 'archived',
          lastUpdated: { toDate: () => new Date('2024-04-01T12:00:00Z') },
        },
      },
    ]);

    render(
      <MemoryRouter>
        <ClientProjects brandCodes={['B1']} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Active Group')).toBeInTheDocument();
    });
    expect(screen.queryByText('Archived Group')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Archived'));

    expect(await screen.findByText('Archived Group')).toBeInTheDocument();
    expect(screen.queryByText('Active Group')).not.toBeInTheDocument();
  });

  test('clicking a card navigates to ad group detail', async () => {
    flushSnapshot([
      {
        id: 'g3',
        data: {
          name: 'Navigation Test',
          brandCode: 'B2',
          status: 'ready',
          lastUpdated: { toDate: () => new Date('2024-06-10T10:00:00Z') },
        },
      },
    ]);

    render(
      <MemoryRouter>
        <ClientProjects brandCodes={['B2']} />
      </MemoryRouter>
    );

    const card = await screen.findByText('Navigation Test');
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/ad-group/g3');
  });

  test('removing all brand codes clears list', async () => {
    flushSnapshot([
      {
        id: 'g4',
        data: {
          name: 'Removable',
          brandCode: 'B3',
          status: 'ready',
          lastUpdated: { toDate: () => new Date('2024-07-01T00:00:00Z') },
        },
      },
    ]);

    const { rerender } = render(
      <MemoryRouter>
        <ClientProjects brandCodes={['B3']} />
      </MemoryRouter>
    );

    await screen.findByText('Removable');
    rerender(
      <MemoryRouter>
        <ClientProjects brandCodes={[]} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Removable')).not.toBeInTheDocument();
  });
});
