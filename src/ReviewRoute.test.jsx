import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewRoute from './ReviewRoute';
import { auth } from './firebase/config';

jest.mock('./firebase/config', () => ({ auth: {} }));

const useUserRole = jest.fn();

jest.mock('./useUserRole', () => (...args) => useUserRole(...args));

const ClientReview = jest.fn(() => <div>ClientReview</div>);
const PublicReview = jest.fn(() => <div>PublicReview</div>);

jest.mock('./ClientReview', () => (props) => ClientReview(props));
jest.mock('./PublicReview', () => (props) => PublicReview(props));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({ search: '' }),
  useParams: () => ({ groupId: 'g1' }),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('renders ClientReview for signed-in user', () => {
  auth.currentUser = { uid: 'u1', isAnonymous: false };
  useUserRole.mockReturnValue({ role: 'client', brandCodes: [], loading: false });
  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );
  expect(ClientReview).toHaveBeenCalled();
  expect(PublicReview).not.toHaveBeenCalled();
  expect(useUserRole).toHaveBeenCalledWith('u1');
});

test('renders PublicReview for anonymous user', () => {
  auth.currentUser = { uid: 'anon', isAnonymous: true };
  useUserRole.mockReturnValue({ role: null, brandCodes: [], loading: false });
  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );
  expect(PublicReview).toHaveBeenCalled();
  expect(ClientReview).not.toHaveBeenCalled();
  expect(useUserRole).toHaveBeenCalledWith(null);
});

test('renders PublicReview when not signed in', () => {
  auth.currentUser = null;
  useUserRole.mockReturnValue({ role: null, brandCodes: [], loading: false });
  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );
  expect(PublicReview).toHaveBeenCalled();
  expect(ClientReview).not.toHaveBeenCalled();
  expect(useUserRole).toHaveBeenCalledWith(undefined);
});
