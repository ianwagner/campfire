import { renderHook, act } from '@testing-library/react';
import useManagerClaim from './useManagerClaim';

jest.mock('./firebase/config', () => ({ auth: {} }));

const mockOnIdTokenChanged = jest.fn();
const mockGetIdTokenResult = jest.fn();

jest.mock('firebase/auth', () => ({
  onIdTokenChanged: (...args) => mockOnIdTokenChanged(...args),
  getIdTokenResult: (...args) => mockGetIdTokenResult(...args),
}));

beforeEach(() => {
  mockOnIdTokenChanged.mockReset();
  mockGetIdTokenResult.mockReset();
});

test('returns manager true when claim present', async () => {
  let listener;
  mockOnIdTokenChanged.mockImplementation((auth, cb) => {
    listener = cb;
    return () => {};
  });

  const user = { getIdToken: jest.fn(() => Promise.resolve()), uid: 'u1' };
  mockGetIdTokenResult.mockResolvedValue({ claims: { manager: true } });

  const { result, waitForNextUpdate } = renderHook(() => useManagerClaim());

  await act(async () => {
    listener(user);
    await waitForNextUpdate();
  });

  expect(result.current.isManager).toBe(true);
  expect(result.current.isReady).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(user.getIdToken).not.toHaveBeenCalled();
});
