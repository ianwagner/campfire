import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDoc = jest.fn();
const onSnapshot = jest.fn();
const updateDoc = jest.fn();
const setDoc = jest.fn();
const getDocs = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const collectionMock = jest.fn((...args) => args);
const queryMock = jest.fn((...args) => args);
const whereMock = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  getDoc: (...args) => getDoc(...args),
  onSnapshot: (...args) => onSnapshot(...args),
  collection: (...args) => collectionMock(...args),
  updateDoc: (...args) => updateDoc(...args),
  setDoc: (...args) => setDoc(...args),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDocs: (...args) => getDocs(...args),
  query: (...args) => queryMock(...args),
  where: (...args) => whereMock(...args),
}));

jest.mock('firebase/storage', () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock('./uploadFile', () => ({ uploadFile: jest.fn() }));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'group1' }),
}));

beforeEach(() => {
  getDoc.mockResolvedValue({
    exists: () => true,
    id: 'group1',
    data: () => ({ name: 'Group 1', brandCode: 'BR1', status: 'draft' }),
  });
  getDocs.mockResolvedValue({ empty: true, docs: [] });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('toggles asset status to ready', async () => {
  onSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'f1.png', status: 'pending' }) }] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('f1.png');
  const select = screen.getByRole('combobox');
  fireEvent.change(select, { target: { value: 'ready' } });

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  expect(updateDoc).toHaveBeenCalledWith('adGroups/group1/assets/asset1', { status: 'ready' });
});

test('toggles asset status back to pending', async () => {
  onSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'f1.png', status: 'ready' }) }] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('f1.png');
  const select = screen.getByRole('combobox');
  fireEvent.change(select, { target: { value: 'pending' } });

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  expect(updateDoc).toHaveBeenCalledWith('adGroups/group1/assets/asset1', { status: 'pending' });
});

test('mark ready writes recipe docs', async () => {
  const batchUpdate = jest.fn();
  const batchCommit = jest.fn();
  const writeBatch = require('firebase/firestore').writeBatch;
  writeBatch.mockReturnValue({ update: batchUpdate, commit: batchCommit });

  onSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        { id: 'a1', data: () => ({ filename: 'BR1_G1_R1_9x16_V1.png', status: 'pending', firebaseUrl: 'u1' }) },
      ],
    });
    return jest.fn();
  });

  getDoc.mockResolvedValueOnce({
    exists: () => true,
    id: 'group1',
    data: () => ({ name: 'Group 1', brandCode: 'BR1', status: 'draft' }),
  });
  // recipe doc does not exist
  getDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('BR1_G1_R1_9x16_V1.png');
  fireEvent.click(screen.getByText('Mark as Ready for Review'));

  await waitFor(() => expect(setDoc).toHaveBeenCalled());
  expect(setDoc).toHaveBeenCalledWith(
    'adGroups/group1/recipes/R1',
    expect.objectContaining({ status: 'ready', brandCode: 'BR1' }),
    { merge: true }
  );
});
