import deleteGroup from './utils/deleteGroup';

jest.mock('./firebase/config', () => ({ db: {}, storage: {} }));

const mockGetDocs = jest.fn();
const mockDeleteDoc = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockCollection = jest.fn((...args) => args);
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  doc: (...args) => mockDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
}));

const mockListAll = jest.fn();
const mockRef = jest.fn((storage, path) => path);
const mockDeleteObject = jest.fn();

jest.mock('firebase/storage', () => ({
  listAll: (...args) => mockListAll(...args),
  ref: (...args) => mockRef(...args),
  deleteObject: (...args) => mockDeleteObject(...args),
}));

describe('deleteGroup utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deletes firestore docs and storage files', async () => {
    const assetSnap = { docs: [{ id: 'a1' }, { id: 'a2' }] };
    const crossSnap = { docs: [{ id: 'c1' }] };

    mockGetDocs
      .mockResolvedValueOnce(assetSnap)
      .mockResolvedValueOnce(crossSnap);

    mockListAll
      .mockResolvedValueOnce({ items: ['i1'], prefixes: ['p1'] })
      .mockResolvedValueOnce({ items: ['i2'], prefixes: [] });

    await deleteGroup('g1', 'B1', 'Group1');

    expect(mockCollection).toHaveBeenCalledWith({}, 'adGroups', 'g1', 'assets');
    expect(mockCollection).toHaveBeenCalledWith({}, 'adAssets');
    expect(mockDeleteDoc).toHaveBeenCalledWith('adGroups/g1/assets/a1');
    expect(mockDeleteDoc).toHaveBeenCalledWith('adGroups/g1/assets/a2');
    expect(mockDeleteDoc).toHaveBeenCalledWith('adAssets/c1');
    expect(mockListAll).toHaveBeenCalledTimes(2);
    expect(mockDeleteObject).toHaveBeenCalledWith('i1');
    expect(mockDeleteObject).toHaveBeenCalledWith('i2');
    expect(mockDeleteDoc).toHaveBeenCalledWith('adGroups/g1');
    expect(mockRef).toHaveBeenCalledWith({}, 'Campfire/Brands/B1/Adgroups/Group1');
  });
});
