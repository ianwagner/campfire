import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminAccounts from './AdminAccounts';

jest.mock('./firebase/config', () => ({ db: {}, functions: {} }));

const getDocs = jest.fn();
const updateDoc = jest.fn();
const deleteDoc = jest.fn();
const docMock = jest.fn(() => ({}));
const collectionMock = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => collectionMock(...args),
  getDocs: (...args) => getDocs(...args),
  updateDoc: (...args) => updateDoc(...args),
  deleteDoc: (...args) => deleteDoc(...args),
  doc: (...args) => docMock(...args)
}));

const callableFn = jest.fn();
const httpsCallable = jest.fn(() => callableFn);

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => httpsCallable(...args)
}));

global.confirm = jest.fn(() => true);

afterEach(() => {
  jest.clearAllMocks();
});

test('calls signOutUser cloud function when Sign Out clicked', async () => {
  getDocs.mockResolvedValue({
    docs: [{ id: 'u1', data: () => ({ role: 'client', brandCodes: [] }) }]
  });

  render(
    <MemoryRouter>
      <AdminAccounts />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText('Sign Out')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Sign Out'));
  expect(httpsCallable).toHaveBeenCalled();
  expect(httpsCallable.mock.calls[0][1]).toBe('signOutUser');
  expect(callableFn).toHaveBeenCalledWith({ uid: 'u1' });
});
