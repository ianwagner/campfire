import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminRequests from './AdminRequests';

jest.mock('./useAgencies', () => () => ({ agencies: [] }));
jest.mock('./useUserRole', () => () => ({ role: 'admin' }));
jest.mock('./firebase/config', () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: 'admin', displayName: 'Admin', email: 'a@a.com' } },
}));

const getDocs = jest.fn();
const addDoc = jest.fn(() => ({ id: 'r1' }));
const updateDoc = jest.fn();
const deleteDoc = jest.fn();
const docMock = jest.fn(() => ({}));
const collectionMock = jest.fn();
const serverTimestamp = jest.fn(() => ({}));
const queryMock = jest.fn((...args) => args);
const whereMock = jest.fn();

const callableFn = jest.fn();
const httpsCallable = jest.fn(() => callableFn);

jest.mock('firebase/firestore', () => ({
  collection: (...args) => collectionMock(...args),
  getDocs: (...args) => getDocs(...args),
  addDoc: (...args) => addDoc(...args),
  updateDoc: (...args) => updateDoc(...args),
  deleteDoc: (...args) => deleteDoc(...args),
  doc: (...args) => docMock(...args),
  Timestamp: { fromDate: () => ({}) },
  serverTimestamp: (...args) => serverTimestamp(...args),
  query: (...args) => queryMock(...args),
  where: (...args) => whereMock(...args),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => httpsCallable(...args)
}));

global.confirm = jest.fn(() => true);

afterEach(() => {
  jest.clearAllMocks();
});

test('opens modal when Add Ticket clicked', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Add Ticket'));
  expect(screen.getByText('Save')).toBeInTheDocument();
});

test('saving ticket adds item to pending table', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getAllByText('No tickets.').length).toBe(4));
  fireEvent.click(screen.getByText('Add Ticket'));
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByText('No tickets.').length).toBe(3));
});

test('shows tooltip when asset link cannot be accessed', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  callableFn.mockRejectedValue(new Error('403'));
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByText('Add Ticket'));
  const label = screen.getByText('Gdrive Link');
  const input = label.parentElement.querySelector('input');
  fireEvent.change(input, { target: { value: 'https://example.com' } });
  await fireEvent.blur(input);

  await waitFor(() =>
    expect(
      screen.getByText(
        'We can’t access this link. Please make sure it’s set to “anyone can view” or the folder may be empty.',
        { exact: false, hidden: true }
      )
    ).toBeInTheDocument()
  );
});

test('includes project managers in editor list', async () => {
  getDocs
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({
      docs: [
        { id: 'e1', data: () => ({ fullName: 'Editor One' }) },
        { id: 'pm1', data: () => ({ fullName: 'PM One' }) },
      ],
    });
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Add Ticket'));
  await waitFor(() => expect(screen.getByText('PM One')).toBeInTheDocument());
});
