import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewPage from './ReviewPage';

jest.mock('./firebase/config', () => ({ auth: {} }));

const signInAnonymously = jest.fn();

jest.mock('firebase/auth', () => ({
  signInAnonymously: (...args) => signInAnonymously(...args),
  signOut: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ groupId: 'g1' }),
  useLocation: () => ({ search: '' }),
}));

const getDoc = jest.fn();
const getDocs = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const collectionMock = jest.fn((...args) => args);
const onSnapshotMock = jest.fn((...args) => jest.fn());

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  getDoc: (...args) => getDoc(...args),
  getDocs: (...args) => getDocs(...args),
  collection: (...args) => collectionMock(...args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  onSnapshot: (...args) => onSnapshotMock(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('shows error when anonymous sign-in fails', async () => {
  signInAnonymously.mockRejectedValue(new Error('oops'));
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  expect(await screen.findByText('oops')).toBeInTheDocument();
});

test('shows loading indicator while signing in', () => {
  signInAnonymously.mockResolvedValue({});
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});

test('shows private message when group is not public', async () => {
  signInAnonymously.mockResolvedValue({});
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ visibility: 'private', password: 'pw', brandCode: 'B1' }),
  });
  getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );
  expect(
    await screen.findByText(/This link is currently private/i)
  ).toBeInTheDocument();
});
