import { renderHook, act } from '@testing-library/react';
import useAdminClaim from './useAdminClaim';

jest.mock('./firebase/config', () => ({ auth: {} }));

const onIdTokenChanged = jest.fn();
const getIdTokenResult = jest.fn();

jest.mock('firebase/auth', () => ({
  onIdTokenChanged: (...args) => onIdTokenChanged(...args),
  getIdTokenResult: (...args) => getIdTokenResult(...args),
}));

beforeEach(() => {
  onIdTokenChanged.mockReset();
  getIdTokenResult.mockReset();
});

test('returns admin true when claim present', async () => {
  let listener;
  onIdTokenChanged.mockImplementation((auth, cb) => {
    listener = cb;
    return () => {};
  });

  const user = { getIdToken: jest.fn(() => Promise.resolve()), uid: 'u1' };
  getIdTokenResult.mockResolvedValue({ claims: { admin: true } });

  const { result, waitForNextUpdate } = renderHook(() => useAdminClaim());

  await act(async () => {
    listener(user);
    await waitForNextUpdate();
  });

  expect(result.current.isAdmin).toBe(true);
  expect(result.current.isReady).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(user.getIdToken).not.toHaveBeenCalled();
});
