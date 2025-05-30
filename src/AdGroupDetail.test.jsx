import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDoc = jest.fn();
const onSnapshot = jest.fn();
const updateDoc = jest.fn();
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

test('opens history modal with previous decisions', async () => {
  onSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        {
          id: 'asset1',
          data: () => ({
            filename: 'BR1_G1_R1_3x5_V1.png',
            status: 'approved',
            uploadedAt: { toDate: () => new Date('2023-01-01') },
            lastUpdatedAt: { toDate: () => new Date('2023-01-02') },
            lastUpdatedBy: 'u1',
            version: 1,
          }),
        },
      ],
    });
    return jest.fn();
  });

  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          filename: 'BR1_G1_R1_3x5_V1.png',
          status: 'approved',
          uploadedAt: { toDate: () => new Date('2023-01-01') },
          lastUpdatedAt: { toDate: () => new Date('2023-01-02') },
          lastUpdatedBy: 'u1',
          version: 1,
        }),
      },
    ],
  };

  const respSnapshot = {
    docs: [
      {
        id: 'resp1',
        data: () => ({
          adUrl: 'https://x/BR1/G1/BR1_G1_R1_3x5_V1.png',
          response: 'approve',
          comment: 'ok',
          userEmail: 'rev@test.com',
          userId: 'u2',
          timestamp: { toDate: () => new Date('2023-01-03') },
        }),
      },
    ],
  };

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'responses') return Promise.resolve(respSnapshot);
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('BR1_G1_R1_3x5_V1.png');
  fireEvent.click(screen.getByLabelText('History'));

  await screen.findByText('approve');
  expect(screen.getByText('rev@test.com')).toBeInTheDocument();
  expect(getDocs).toHaveBeenCalledWith(['adGroups', 'group1', 'responses']);
  expect(getDocs).toHaveBeenCalledWith(['adGroups', 'group1', 'assets']);
  expect(screen.getByText('pending')).toBeInTheDocument();
});

