import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CreateAdGroup from './CreateAdGroup';
import RecipePreview from './RecipePreview.jsx';
import { addDoc, getDoc } from 'firebase/firestore';

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user1' } },
}));
jest.mock('./uploadFile.js', () => ({ uploadFile: jest.fn(() => Promise.resolve('url')) }));

jest.mock('firebase/firestore', () => {
  const mockCollection = jest.fn();
  const mockAddDoc = jest.fn(() => Promise.resolve({ id: '1' }));
  const mockServerTimestamp = jest.fn();
  const mockDoc = jest.fn();
  const mockGetDoc = jest.fn(() =>
    Promise.resolve({ exists: () => true, data: () => ({ brandCodes: ['BR1'] }) })
  );
  const mockWriteBatch = jest.fn(() => ({ set: jest.fn(), commit: jest.fn() }));

  return {
    collection: mockCollection,
    addDoc: mockAddDoc,
    serverTimestamp: mockServerTimestamp,
    doc: mockDoc,
    getDoc: mockGetDoc,
    writeBatch: mockWriteBatch,
  };
});

jest.mock('./RecipePreview.jsx', () => ({
  __esModule: true,
  default: jest.fn(() => <div />),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('renders Create Project heading', () => {
  render(
    <MemoryRouter>
      <CreateAdGroup />
    </MemoryRouter>
  );
  expect(screen.getByText(/Create Project/i)).toBeInTheDocument();
});

test('renders when sidebar hidden', () => {
  render(
    <MemoryRouter>
      <CreateAdGroup showSidebar={false} />
    </MemoryRouter>
  );
  expect(screen.getByText(/Create Project/i)).toBeInTheDocument();
});

test('creates ad groups with review version 2 by default', async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <CreateAdGroup />
      </MemoryRouter>
    );
  });

  await waitFor(() => expect(RecipePreview).toHaveBeenCalled());

  await act(async () => {
    const props = RecipePreview.mock.calls[RecipePreview.mock.calls.length - 1][0];
    props.onTitleChange('My New Group');
  });

  await act(async () => {
    const props = RecipePreview.mock.calls[RecipePreview.mock.calls.length - 1][0];
    await props.onSave([], '', [], null, null);
  });

  await waitFor(() => expect(addDoc).toHaveBeenCalled());

  const args = addDoc.mock.calls[addDoc.mock.calls.length - 1];
  expect(args[1]).toEqual(expect.objectContaining({ reviewVersion: 2 }));

  expect(getDoc).toHaveBeenCalled();
});
