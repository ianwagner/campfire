import recordRecipeStatus from './recordRecipeStatus';

jest.mock('../firebase/config', () => ({ db: {} }));

const docMock = jest.fn(() => 'docRef');
const setDocMock = jest.fn();
const arrayUnionMock = jest.fn((val) => val);
const serverTimestampMock = jest.fn(() => 'ts');

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  setDoc: (...args) => setDocMock(...args),
  arrayUnion: (...args) => arrayUnionMock(...args),
  serverTimestamp: (...args) => serverTimestampMock(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('records recipe status with history', async () => {
  await recordRecipeStatus('g1', '001', 'approved', 'u1');
  expect(docMock).toHaveBeenCalledWith({}, 'adGroups', 'g1', 'recipes', '001');
  expect(setDocMock).toHaveBeenCalledWith(
    'docRef',
    {
      status: 'approved',
      lastUpdatedBy: 'u1',
      lastUpdatedAt: 'ts',
      history: arrayUnionMock({ status: 'approved', timestamp: 'ts', userId: 'u1' }),
    },
    { merge: true },
  );
});
