import syncAssetLibrary from './syncAssetLibrary';

jest.mock('../firebase/config', () => ({ db: {} }));

jest.mock('firebase/firestore', () => {
  const docMock = jest.fn((...args) => args.slice(1).join('/'));
  const setDocMock = jest.fn(() => Promise.resolve());
  const deleteDocMock = jest.fn(() => Promise.resolve());
  const getDocsMock = jest.fn();
  const collectionMock = jest.fn(() => 'collection');
  const queryMock = jest.fn(() => 'query');
  const whereMock = jest.fn(() => 'where');
  return {
    doc: (...args) => docMock(...args),
    setDoc: (...args) => setDocMock(...args),
    deleteDoc: (...args) => deleteDocMock(...args),
    getDocs: (...args) => getDocsMock(...args),
    collection: (...args) => collectionMock(...args),
    query: (...args) => queryMock(...args),
    where: (...args) => whereMock(...args),
    __esModule: true,
    docMock,
    setDocMock,
    deleteDocMock,
    getDocsMock,
    collectionMock,
    queryMock,
    whereMock,
  };
});

const {
  docMock,
  setDocMock: mockSetDoc,
  deleteDocMock: mockDeleteDoc,
  getDocsMock: mockGetDocs,
  collectionMock,
  queryMock,
  whereMock,
} = require('firebase/firestore');

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
