import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewPage from './ReviewPage';
jest.mock('./Review', () => () => <div>Review</div>);

jest.mock('./firebase/config', () => ({ auth: {} }));

const mockSignInAnonymously = jest.fn();

jest.mock('firebase/auth', () => ({
  signInAnonymously: (...args) => mockSignInAnonymously(...args),
  signOut: jest.fn(),
}));

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
});

test('shows error when anonymous sign-in fails', async () => {
  mockSignInAnonymously.mockRejectedValue(new Error('oops'));
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  expect(await screen.findByText('oops')).toBeInTheDocument();
});

test('shows loading indicator while signing in', () => {
  mockSignInAnonymously.mockResolvedValue({});
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});

test('shows private message when group is not public', async () => {
  mockSignInAnonymously.mockResolvedValue({});
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ visibility: 'private', password: 'pw', brandCode: 'B1' }),
  });
  mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  expect(
    await screen.findByText(/This link is currently private/i)
  ).toBeInTheDocument();
});

test('skips asset subscription for brief reviews', async () => {
  mockSignInAnonymously.mockResolvedValue({});
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ visibility: 'public', brandCode: 'B1', reviewVersion: 4 }),
  });
  mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());
  const assetCall = mockOnSnapshot.mock.calls.find(
    (c) => c[0][1] === 'adGroups' && c[0][3] === 'assets'
  );
  expect(assetCall).toBeUndefined();
});
