import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewPage from './ReviewPage';

jest.mock('./firebase/config', () => ({ db: {} }));

jest.mock('./Review', () => jest.fn(() => null));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ groupId: 'g1' }),
  useLocation: () => ({ search: '' }),
}));

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockCollection = jest.fn((...args) => args);
const mockOnSnapshot = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

beforeEach(() => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ size: 0, docs: [] });
    return jest.fn();
  });
  mockGetDoc.mockResolvedValue({ exists: () => false });
  mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
});

test('shows error when authError is provided', async () => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ visibility: 'private', password: 'pw', brandCode: 'B1' }),
  });
  mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
  render(
    <MemoryRouter>
      <ReviewPage authError="oops" />
    </MemoryRouter>
  );
  expect(await screen.findByText('oops')).toBeInTheDocument();
});

test('shows loading indicator while auth is loading', () => {
  render(
    <MemoryRouter>
      <ReviewPage authLoading user={{ uid: 'anon', isAnonymous: true }} />
    </MemoryRouter>
  );
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});

test('shows private message when group is not public', async () => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ visibility: 'private', password: 'pw', brandCode: 'B1' }),
  });
  mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
  render(
    <MemoryRouter>
      <ReviewPage user={{ uid: 'anon', isAnonymous: true }} />
    </MemoryRouter>
  );
  expect(
    await screen.findByText(/This link is currently private/i)
  ).toBeInTheDocument();
});
