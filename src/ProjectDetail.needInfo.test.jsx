import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ProjectDetail from './ProjectDetail.jsx';

const mockGetDoc = jest.fn();
const mockOnSnapshot = jest.fn();

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('./useUserRole', () => () => ({ role: 'client' }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  doc: jest.fn((...args) => args.join('/')),
  getDoc: (...args) => mockGetDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

jest.mock('./components/StatusBadge.jsx', () => ({ status }) => (
  <div data-testid="status">{status}</div>
));
jest.mock('./components/OptimizedImage.jsx', () => (props) => (
  <img alt={props.alt} data-testid="image" />
));
jest.mock('./components/VideoPlayer.jsx', () => () => <div data-testid="video" />);
jest.mock('./LoadingOverlay.jsx', () => () => <div data-testid="loading" />);
jest.mock('./components/Button.jsx', () => ({ children, ...props }) => (
  <button {...props}>{children}</button>
));

const mockUseParams = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockUseParams(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ projectId: 'g1' });
});

test('renders ad group details and assets', async () => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    id: 'g1',
    data: () => ({
      name: 'Launch Group',
      brandCode: 'ACME',
      status: 'ready',
      createdAt: { toDate: () => new Date('2024-01-01T00:00:00Z') },
    }),
  });
  mockOnSnapshot
    .mockImplementationOnce((ref, cb) => {
      cb({
        docs: [
          {
            id: 'asset1',
            data: () => ({
              filename: 'ACME_Launch_Story_V1.png',
              status: 'approved',
              firebaseUrl: 'https://example.com/ad.png',
            }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((ref, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((ref, cb) => {
      cb({ docs: [] });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ProjectDetail />
    </MemoryRouter>
  );

  expect(await screen.findByText('Launch Group')).toBeInTheDocument();
  expect(screen.getByText('ACME')).toBeInTheDocument();
  expect(screen.getAllByText('ACME_Launch_Story_V1.png').length).toBeGreaterThan(0);
  const statuses = screen.getAllByTestId('status').map((el) => el.textContent);
  expect(statuses).toContain('approved');
});

test('shows message when ad group is missing', async () => {
  mockGetDoc.mockResolvedValue({ exists: () => false });
  mockOnSnapshot.mockImplementation(() => jest.fn());

  render(
    <MemoryRouter>
      <ProjectDetail />
    </MemoryRouter>
  );

  expect(await screen.findByText('Ad group not found')).toBeInTheDocument();
});

test('renders brief details and copy deck', async () => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    id: 'g1',
    data: () => ({
      name: 'Briefed Group',
      brandCode: 'ACME',
      status: 'ready',
      notes: 'Please prioritize spring imagery.',
    }),
  });
  mockOnSnapshot
    .mockImplementationOnce((ref, cb) => {
      cb({ docs: [] });
      return jest.fn();
    })
    .mockImplementationOnce((ref, cb) => {
      cb({
        docs: [
          {
            id: 'copy1',
            data: () => ({
              primary: 'Spring Sale',
              headline: 'Save Big',
              description: 'Huge discounts on all items.',
              product: 'Shoes',
            }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((ref, cb) => {
      cb({
        docs: [
          {
            id: 'brief1',
            data: () => ({ filename: 'moodboard.pdf', firebaseUrl: 'https://example.com/moodboard.pdf' }),
          },
        ],
      });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ProjectDetail />
    </MemoryRouter>
  );

  expect(await screen.findByText('Briefed Group')).toBeInTheDocument();
  expect(screen.getByText('Please prioritize spring imagery.')).toBeInTheDocument();
  expect(screen.getByText('Spring Sale')).toBeInTheDocument();
  expect(screen.getByText('moodboard.pdf')).toBeInTheDocument();
});
