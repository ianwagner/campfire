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

const mockGetDocs = jest.fn();
const mockAddDoc = jest.fn(() => ({ id: 'r1' }));
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockDoc = jest.fn(() => ({}));
const mockCollection = jest.fn();
const mockServerTimestamp = jest.fn(() => ({}));
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn();

const callableFn = jest.fn();
const mockHttpsCallable = jest.fn(() => callableFn);

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  doc: (...args) => mockDoc(...args),
  Timestamp: { fromDate: () => ({}) },
  serverTimestamp: (...args) => mockServerTimestamp(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  deleteField: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args)
}));

global.confirm = jest.fn(() => true);

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(() => ({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    })),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('opens modal when Add Ticket clicked', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByLabelText('Add Ticket'));
  expect(screen.getByText('Save')).toBeInTheDocument();
});

test('saving ticket adds item to pending table', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getAllByText('No tickets.').length).toBe(5));
  fireEvent.click(screen.getByLabelText('Add Ticket'));
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => expect(mockAddDoc).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByText('No tickets.').length).toBe(4));
});

test.skip('shows tooltip when asset link cannot be accessed', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  callableFn.mockRejectedValue(new Error('403'));
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByLabelText('Add Ticket'));
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
  mockGetDocs
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
  fireEvent.click(screen.getByLabelText('Add Ticket'));
  await waitFor(() => expect(screen.getByText('PM One')).toBeInTheDocument());
});

test('status change to need info copies note to project', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockGetDocs.mockResolvedValueOnce({
    docs: [
      {
        id: 'r1',
        data: () => ({
          brandCode: 'B1',
          status: 'new',
          infoNote: 'Need details',
          projectId: 'p1',
        }),
      },
    ],
  });

  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByLabelText('Table view'));
  const select = await screen.findByRole('combobox');
  mockUpdateDoc.mockClear();
  fireEvent.change(select, { target: { value: 'need info' } });
  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
  expect(mockUpdateDoc.mock.calls[1][1]).toEqual({
    status: 'need info',
    infoNote: 'Need details',
  });
});

test('adding info note in need info status updates project', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockGetDocs.mockResolvedValueOnce({
    docs: [
      {
        id: 'r1',
        data: () => ({
          brandCode: 'B1',
          status: 'new',
          infoNote: '',
          projectId: 'p1',
        }),
      },
    ],
  });

  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByLabelText('Table view'));
  const select = await screen.findByRole('combobox');
  fireEvent.change(select, { target: { value: 'need info' } });
  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
  mockUpdateDoc.mockClear();

  fireEvent.click(await screen.findByLabelText('Edit'));
  const label = await screen.findByText('Info Needed');
  const note = label.parentElement.querySelector('textarea');
  fireEvent.change(note, { target: { value: 'Need assets' } });
  fireEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
  expect(mockUpdateDoc.mock.calls[1][1]).toEqual({ infoNote: 'Need assets' });
});

test('changing status from need info to new sets project to processing', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockGetDocs.mockResolvedValueOnce({
    docs: [
      {
        id: 'r1',
        data: () => ({
          brandCode: 'B1',
          status: 'need info',
          infoNote: 'Need details',
          projectId: 'p1',
        }),
      },
    ],
  });

  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByLabelText('Table view'));
  const select = await screen.findByRole('combobox');
  mockUpdateDoc.mockClear();
  fireEvent.change(select, { target: { value: 'new' } });
  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
  expect(mockUpdateDoc.mock.calls[0][1]).toEqual({ status: 'new' });
  expect(mockUpdateDoc.mock.calls[1][1]).toMatchObject({ status: 'processing' });
});

test('changing status from need info to ready leaves project status unchanged', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockGetDocs.mockResolvedValueOnce({
    docs: [
      {
        id: 'r1',
        data: () => ({
          brandCode: 'B1',
          status: 'need info',
          infoNote: 'Need details',
          projectId: 'p1',
        }),
      },
    ],
  });

  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByLabelText('Table view'));
  const select = await screen.findByRole('combobox');
  mockUpdateDoc.mockClear();
  fireEvent.change(select, { target: { value: 'ready' } });
  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(2));
  expect(mockUpdateDoc.mock.calls[0][1]).toEqual({ status: 'ready' });
  expect(mockUpdateDoc.mock.calls[1][1]).toEqual({ infoNote: undefined });
});
