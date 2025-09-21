import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewPage from './ReviewPage';

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
const mockListen = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
}));

jest.mock('./firebase/listen', () => ({
  __esModule: true,
  default: (...args) => mockListen(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

beforeEach(() => {
  mockListen.mockImplementation((col, cb) => {
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
