import { renderHook, act } from '@testing-library/react';
import useAssets from './useAssets';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDocs = jest.fn();
const collectionMock = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  getDocs: (...args) => getDocs(...args),
  collection: (...args) => collectionMock(...args),
}));

test('loads assets from firestore', async () => {
  const snap = { docs: [{ id: 'a1', data: () => ({ foo: 'bar' }) }] };
  getDocs.mockResolvedValueOnce(snap);

  const { result, waitForNextUpdate } = renderHook(() => useAssets());

  await act(async () => {
    await waitForNextUpdate();
  });

  expect(collectionMock).toHaveBeenCalledWith({}, 'adAssets');
  expect(result.current).toEqual([{ id: 'a1', foo: 'bar' }]);
});
