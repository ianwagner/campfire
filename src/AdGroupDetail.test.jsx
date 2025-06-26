import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));

const useUserRole = jest.fn(() => ({ role: 'admin', brandCodes: [], loading: false }));
jest.mock('./useUserRole', () => (...args) => useUserRole(...args));

const getDoc = jest.fn();
const onSnapshot = jest.fn();
const updateDoc = jest.fn();
const setDoc = jest.fn();
const getDocs = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const collectionMock = jest.fn((...args) => args);
const queryMock = jest.fn((...args) => args);
const whereMock = jest.fn((...args) => args);
const arrayUnionMock = jest.fn((...args) => args);

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
  arrayUnion: (...args) => arrayUnionMock(...args),
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

test('fetches recipe history', async () => {
  onSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        { id: 'asset1', data: () => ({ filename: '1_9x16.png', status: 'ready' }) },
        { id: 'asset2', data: () => ({ filename: '1_3x5.png', status: 'ready' }) },
      ],
    });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('1_9x16.png');
  const historyBtn = screen.getByLabelText('History');
  fireEvent.click(historyBtn);

  await waitFor(() => expect(getDocs).toHaveBeenCalled());
  expect(collectionMock).toHaveBeenCalledWith(
    {},
    'adGroups',
    'group1',
    'assets',
    'asset1',
    'history'
  );
});

test('opens metadata modal for recipe id "1"', async () => {
  onSnapshot.mockImplementation((col, cb) => {
    const path = Array.isArray(col) ? col.join('/') : '';
    if (path.includes('recipes')) {
      cb({
        docs: [
          {
            id: '1',
            data: () => ({ metadata: {}, copy: 'hello', components: {} }),
          },
        ],
      });
    } else {
      cb({ docs: [{ id: 'asset1', data: () => ({ filename: '1_9x16.png', status: 'ready' }) }] });
    }
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('1_9x16.png');
  const metadataBtn = screen.getByLabelText('Metadata');
  fireEvent.click(metadataBtn);

  await screen.findByText('Metadata for Recipe 1');
  expect(screen.getByLabelText('Copy')).toBeInTheDocument();
});
