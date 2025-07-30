import { renderHook, act } from '@testing-library/react';
import useAssets from './useAssets';

jest.mock('./firebase/config', () => ({ db: {} }));

jest.mock('firebase/firestore', () => {
  const getDocsMock = jest.fn();
  const collectionMock = jest.fn((...args) => args);
  return {
    getDocs: (...args) => getDocsMock(...args),
    collection: (...args) => collectionMock(...args),
    __esModule: true,
    getDocsMock,
    collectionMock,
  };
});

const { getDocsMock: getDocs, collectionMock } = require('firebase/firestore');

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
