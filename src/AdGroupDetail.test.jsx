import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {}, storage: {} }));

const deleteDoc = jest.fn();
const getDoc = jest.fn(() => Promise.resolve({
  exists: () => true,
  id: 'group1',
  data: () => ({ name: 'My Group', brandCode: 'B', status: 'draft' })
}));
const onSnapshot = jest.fn((ref, cb) => {
  cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'file.png', status: 'draft', comment: null, firebaseUrl: '#' }) }] });
  return () => {};
});

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc,
  updateDoc: jest.fn(),
  collection: jest.fn(() => ({})),
  addDoc: jest.fn(),
  onSnapshot,
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
  deleteDoc,
}));

const deleteObject = jest.fn(() => Promise.resolve());

jest.mock('firebase/storage', () => ({
  ref: jest.fn(() => ({})),
  deleteObject,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: '123' }),
}));

describe('AdGroupDetail deletion', () => {
  test('renders Delete buttons', async () => {
    render(
      <MemoryRouter>
        <AdGroupDetail />
      </MemoryRouter>
    );
    expect(await screen.findByText('Delete')).toBeInTheDocument();
  });

  test('calls delete methods when Delete clicked', async () => {
    render(
      <MemoryRouter>
        <AdGroupDetail />
      </MemoryRouter>
    );
    const btn = await screen.findByText('Delete');
    fireEvent.click(btn);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });
});
