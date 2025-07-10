import syncAssetLibrary from './syncAssetLibrary';

jest.mock('../firebase/config', () => ({ db: {} }));

const setDoc = jest.fn(() => Promise.resolve());
const docMock = jest.fn((...args) => args.slice(1).join('/'));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  setDoc: (...args) => setDoc(...args),
}));

test('writes each asset with brand code', async () => {
  await syncAssetLibrary('B1', [{ id: 'a1', name: 'Asset' }]);
  expect(docMock).toHaveBeenCalledWith({}, 'adAssets', 'a1');
  expect(setDoc).toHaveBeenCalledWith(
    'adAssets/a1',
    { id: 'a1', name: 'Asset', brandCode: 'B1' },
    { merge: true }
  );
});

test('handles empty array', async () => {
  await syncAssetLibrary('B1', []);
  expect(setDoc).not.toHaveBeenCalled();
});
