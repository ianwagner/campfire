import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ReviewRoute from './ReviewRoute';
import { auth } from './firebase/config';

jest.mock('./firebase/config', () => ({ auth: { currentUser: null } }));

const mockSignInAnonymously = jest.fn();
const mockOnAuthStateChanged = jest.fn();

jest.mock('firebase/auth', () => ({
  signInAnonymously: (...args) => mockSignInAnonymously(...args),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
}));

const mockUseUserRole = jest.fn();

jest.mock('./useUserRole', () => (...args) => mockUseUserRole(...args));

const mockReviewPage = jest.fn(() => <div>ReviewPage</div>);

jest.mock('./ReviewPage', () => (props) => mockReviewPage(props));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({ search: '' }),
  useParams: () => ({ groupId: 'g1' }),
}));

afterEach(() => {
  jest.clearAllMocks();
  auth.currentUser = null;
});

const setupAuthListener = () => {
  const listeners = [];
  mockOnAuthStateChanged.mockImplementation((_, cb) => {
    listeners.push(cb);
    return jest.fn();
  });
  return listeners;
};

test('renders ReviewPage for signed-in user restored from auth listener', async () => {
  const listeners = setupAuthListener();
  mockUseUserRole.mockReturnValue({ role: 'client', brandCodes: ['b1'], loading: false });

  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );

  expect(mockOnAuthStateChanged).toHaveBeenCalledWith(auth, expect.any(Function));

  act(() => {
    listeners[0]({ uid: 'u1', isAnonymous: false });
  });

  await waitFor(() => {
    expect(mockReviewPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ uid: 'u1', isAnonymous: false }),
        authLoading: false,
        authError: null,
        userRole: 'client',
        brandCodes: ['b1'],
      })
    );
  });
  expect(mockSignInAnonymously).not.toHaveBeenCalled();
  expect(mockUseUserRole).toHaveBeenCalledWith('u1');
});

test('does not replace authenticated user with anonymous session', async () => {
  const listeners = setupAuthListener();
  mockUseUserRole.mockReturnValue({ role: 'client', brandCodes: [], loading: false });

  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );

  act(() => {
    listeners[0]({ uid: 'user-123', isAnonymous: false });
  });

  await waitFor(() => {
    expect(mockReviewPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ uid: 'user-123', isAnonymous: false }),
      })
    );
  });

  expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

test('signs in anonymously when listener reports no user', async () => {
  const listeners = setupAuthListener();
  mockUseUserRole.mockReturnValue({ role: null, brandCodes: [], loading: false });
  mockSignInAnonymously.mockResolvedValue({});

  render(
    <MemoryRouter>
      <ReviewRoute />
    </MemoryRouter>
  );

  act(() => {
    listeners[0](null);
  });

  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalledWith(auth));

  act(() => {
    listeners[0]({ uid: 'anon', isAnonymous: true });
  });

  await waitFor(() => {
    expect(mockReviewPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ uid: 'anon', isAnonymous: true }),
        authLoading: false,
        userRole: null,
        brandCodes: [],
      })
    );
  });
  expect(mockUseUserRole).toHaveBeenLastCalledWith(null);
});
