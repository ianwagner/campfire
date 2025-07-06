import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminRequests from './AdminRequests';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDocs = jest.fn();
const addDoc = jest.fn(() => ({ id: 'r1' }));
const updateDoc = jest.fn();
const deleteDoc = jest.fn();
const docMock = jest.fn(() => ({}));
const collectionMock = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => collectionMock(...args),
  getDocs: (...args) => getDocs(...args),
  addDoc: (...args) => addDoc(...args),
  updateDoc: (...args) => updateDoc(...args),
  deleteDoc: (...args) => deleteDoc(...args),
  doc: (...args) => docMock(...args),
  Timestamp: { fromDate: () => ({}) },
}));

global.confirm = jest.fn(() => true);

afterEach(() => {
  jest.clearAllMocks();
});

test('opens modal when Request Ads clicked', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  render(
    <MemoryRouter>
      <AdminRequests />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Request Ads'));
  expect(screen.getByText('Save')).toBeInTheDocument();
});
