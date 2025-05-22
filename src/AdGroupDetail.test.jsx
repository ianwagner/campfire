import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDoc = jest.fn();
const onSnapshot = jest.fn();
const updateDoc = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const collectionMock = jest.fn((...args) => args);

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
  const checkbox = screen.getByRole('checkbox');
  fireEvent.click(checkbox);

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
  const checkbox = screen.getByRole('checkbox');
  fireEvent.click(checkbox);

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  expect(updateDoc).toHaveBeenCalledWith('adGroups/group1/assets/asset1', { status: 'pending' });
});
