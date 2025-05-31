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
  onSnapshot.mockImplementation((ref, cb) => {
    if (Array.isArray(ref)) {
      cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'f1.png', status: 'pending' }) }] });
    } else {
      cb({ exists: () => true, data: () => ({ status: 'pending', comment: '' }) });
    }
    return jest.fn();
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('toggles asset status to ready', async () => {

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

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('1_9x16.png');
  const historyBtn = screen.getByLabelText('History');
  fireEvent.click(historyBtn);

  await waitFor(() => expect(getDoc).toHaveBeenCalled());
  expect(docMock).toHaveBeenCalledWith({}, 'recipes', '1');
});
