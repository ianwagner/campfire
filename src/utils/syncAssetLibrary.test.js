import syncAssetLibrary from './syncAssetLibrary';

jest.mock('../firebase/config', () => ({ db: {} }));

const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());
const mockGetDocs = jest.fn();
const collectionMock = jest.fn(() => 'collection');
const queryMock = jest.fn(() => 'query');
const whereMock = jest.fn(() => 'where');
const docMock = jest.fn((...args) => args.slice(1).join('/'));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => collectionMock(...args),
  query: (...args) => queryMock(...args),
  where: (...args) => whereMock(...args),
}));

test('writes each asset with brand code', async () => {
  mockGetDocs.mockResolvedValueOnce({ docs: [] });
  await syncAssetLibrary('B1', [{ id: 'a1', name: 'Asset' }]);
  expect(mockGetDocs).toHaveBeenCalled();
  expect(docMock).toHaveBeenCalledWith({}, 'adAssets', 'a1');
  expect(mockSetDoc).toHaveBeenCalledWith(
    'adAssets/a1',
    { id: 'a1', name: 'Asset', brandCode: 'B1' },
    { merge: true }
  );
  expect(mockDeleteDoc).not.toHaveBeenCalled();
});

test('deletes missing assets', async () => {
  mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'a1' }] });
  await syncAssetLibrary('B1', []);
  expect(mockDeleteDoc).toHaveBeenCalledWith('adAssets/a1');
});
