import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PublicReview from './PublicReview';

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

afterEach(() => {
  jest.clearAllMocks();
});

test('shows error when anonymous sign-in fails', async () => {
  signInAnonymously.mockRejectedValue(new Error('oops'));
  render(
    <MemoryRouter>
      <PublicReview />
    </MemoryRouter>
  );
  expect(await screen.findByText('oops')).toBeInTheDocument();
});

test('shows loading indicator while signing in', () => {
  signInAnonymously.mockResolvedValue({});
  render(
    <MemoryRouter>
      <PublicReview />
    </MemoryRouter>
  );
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});
