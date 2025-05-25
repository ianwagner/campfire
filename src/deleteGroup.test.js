import deleteGroup from './utils/deleteGroup';

jest.mock('./firebase/config', () => ({ db: {}, storage: {} }));

const getDocs = jest.fn();
const deleteDoc = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const collectionMock = jest.fn((...args) => args);
const queryMock = jest.fn((...args) => args);
const whereMock = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: (...args) => collectionMock(...args),
  getDocs: (...args) => getDocs(...args),
  query: (...args) => queryMock(...args),
  where: (...args) => whereMock(...args),
  doc: (...args) => docMock(...args),
  deleteDoc: (...args) => deleteDoc(...args),
}));

const listAll = jest.fn();
const refMock = jest.fn((storage, path) => path);
const deleteObject = jest.fn();

jest.mock('firebase/storage', () => ({
  listAll: (...args) => listAll(...args),
  ref: (...args) => refMock(...args),
  deleteObject: (...args) => deleteObject(...args),
}));

describe('deleteGroup utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deletes firestore docs and storage files', async () => {
    const assetSnap = { docs: [{ id: 'a1' }, { id: 'a2' }] };
    const crossSnap = { docs: [{ id: 'c1' }] };

    getDocs
      .mockResolvedValueOnce(assetSnap)
      .mockResolvedValueOnce(crossSnap);

    listAll
      .mockResolvedValueOnce({ items: ['i1'], prefixes: ['p1'] })
      .mockResolvedValueOnce({ items: ['i2'], prefixes: [] });

    await deleteGroup('g1', 'B1', 'Group1');

    expect(collectionMock).toHaveBeenCalledWith({}, 'adGroups', 'g1', 'assets');
    expect(collectionMock).toHaveBeenCalledWith({}, 'adAssets');
    expect(deleteDoc).toHaveBeenCalledWith('adGroups/g1/assets/a1');
    expect(deleteDoc).toHaveBeenCalledWith('adGroups/g1/assets/a2');
    expect(deleteDoc).toHaveBeenCalledWith('adAssets/c1');
    expect(listAll).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledWith('i1');
    expect(deleteObject).toHaveBeenCalledWith('i2');
    expect(deleteDoc).toHaveBeenCalledWith('adGroups/g1');
    expect(refMock).toHaveBeenCalledWith({}, 'Campfire/Brands/B1/Adgroups/Group1');
  });
});
