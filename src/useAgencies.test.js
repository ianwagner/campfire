import { renderHook, act } from '@testing-library/react';
import useAgencies from './useAgencies';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDocs = jest.fn();
const collectionMock = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  getDocs: (...args) => getDocs(...args),
  collection: (...args) => collectionMock(...args),
}));

test('loads agencies from firestore', async () => {
  const snap = { docs: [{ id: 'a1', data: () => ({ name: 'Test Agency' }) }] };
  getDocs.mockResolvedValueOnce(snap);

  const { result, waitForNextUpdate } = renderHook(() => useAgencies());

  expect(result.current.loading).toBe(true);

  await act(async () => {
    await waitForNextUpdate();
  });

  expect(collectionMock).toHaveBeenCalledWith({}, 'agencies');
  expect(result.current.agencies).toEqual([{ id: 'a1', name: 'Test Agency' }]);
  expect(result.current.loading).toBe(false);
});
