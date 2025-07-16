import syncAssetLibrary from './syncAssetLibrary';

jest.mock('../firebase/config', () => ({ db: {} }));

const setDoc = jest.fn(() => Promise.resolve());
const deleteDoc = jest.fn(() => Promise.resolve());
const getDocs = jest.fn();
const collectionMock = jest.fn(() => 'collection');
const queryMock = jest.fn(() => 'query');
const whereMock = jest.fn(() => 'where');
const docMock = jest.fn((...args) => args.slice(1).join('/'));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  setDoc: (...args) => setDoc(...args),
  deleteDoc: (...args) => deleteDoc(...args),
  getDocs: (...args) => getDocs(...args),
  collection: (...args) => collectionMock(...args),
  query: (...args) => queryMock(...args),
  where: (...args) => whereMock(...args),
}));

test('writes each asset with brand code', async () => {
  getDocs.mockResolvedValueOnce({ docs: [] });
  await syncAssetLibrary('B1', [{ id: 'a1', name: 'Asset' }]);
  expect(getDocs).toHaveBeenCalled();
  expect(docMock).toHaveBeenCalledWith({}, 'adAssets', 'a1');
  expect(setDoc).toHaveBeenCalledWith(
    'adAssets/a1',
    { id: 'a1', name: 'Asset', brandCode: 'B1' },
    { merge: true }
  );
  expect(deleteDoc).not.toHaveBeenCalled();
});

test('deletes missing assets', async () => {
  getDocs.mockResolvedValueOnce({ docs: [{ id: 'a1' }] });
  await syncAssetLibrary('B1', []);
  expect(deleteDoc).toHaveBeenCalledWith('adAssets/a1');
});
