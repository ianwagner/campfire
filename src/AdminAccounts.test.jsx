import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminAccounts from './AdminAccounts';

jest.mock('./firebase/config', () => ({ db: {}, functions: {} }));
jest.mock('./utils/debugLog', () => jest.fn());

const mockGetDocs = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockDoc = jest.fn(() => ({}));
const mockCollection = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  doc: (...args) => mockDoc(...args)
}));

const mockCallableFn = jest.fn();
const mockHttpsCallable = jest.fn(() => mockCallableFn);

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args)
}));

global.confirm = jest.fn(() => true);

afterEach(() => {
  jest.clearAllMocks();
});

test('calls signOutUser cloud function when Sign Out clicked', async () => {
  mockGetDocs.mockResolvedValue({
    docs: [
      {
        id: 'u1',
        data: () => ({ role: 'client', brandCodes: [], email: 'user@example.com' })
      }
    ]
  });

  render(
    <MemoryRouter>
      <AdminAccounts />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText('Sign Out')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Sign Out'));
  expect(mockHttpsCallable).toHaveBeenCalled();
  expect(mockHttpsCallable.mock.calls[0][1]).toBe('signOutUser');
  expect(mockCallableFn).toHaveBeenCalledWith({ uid: 'u1' });
});
