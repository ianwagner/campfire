import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewRoute from './ReviewRoute';
import { auth } from './firebase/config';

jest.mock('./firebase/config', () => ({ auth: {} }));

const signInAnonymously = jest.fn();

jest.mock('firebase/auth', () => ({
  signInAnonymously: (...args) => signInAnonymously(...args),
}));

const useUserRole = jest.fn();

jest.mock('./useUserRole', () => (...args) => useUserRole(...args));

const ReviewPage = jest.fn(() => <div>ReviewPage</div>);

jest.mock('./ReviewPage', () => (props) => ReviewPage(props));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({ search: '' }),
  useParams: () => ({ groupId: 'g1' }),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('renders ReviewPage for signed-in user', () => {
  auth.currentUser = { uid: 'u1', isAnonymous: false };
  useUserRole.mockReturnValue({ role: 'client', brandCodes: [], loading: false });
  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );
  expect(ReviewPage).toHaveBeenCalled();
  expect(useUserRole).toHaveBeenCalledWith('u1');
});

test('renders ReviewPage for anonymous user', () => {
  auth.currentUser = { uid: 'anon', isAnonymous: true };
  useUserRole.mockReturnValue({ role: null, brandCodes: [], loading: false });
  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );
  expect(ReviewPage).toHaveBeenCalled();
  expect(useUserRole).toHaveBeenCalledWith(null);
});

import { waitFor } from '@testing-library/react';

test('signs in anonymously when not signed in', async () => {
  auth.currentUser = null;
  signInAnonymously.mockImplementation(() => {
    auth.currentUser = { uid: 'anon', isAnonymous: true };
    return Promise.resolve({});
  });
  useUserRole.mockReturnValue({ role: null, brandCodes: [], loading: false });
  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );
  expect(signInAnonymously).toHaveBeenCalled();
  await waitFor(() => expect(ReviewPage).toHaveBeenCalled());
  expect(useUserRole).toHaveBeenCalledWith(null);
});
