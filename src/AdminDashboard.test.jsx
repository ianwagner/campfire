import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminDashboard from './AdminDashboard';

jest.mock('./firebase/config', () => ({ auth: {}, db: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  query: jest.fn(),
  where: jest.fn(),
  doc: jest.fn(),
  deleteDoc: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  listAll: jest.fn(() => Promise.resolve({ items: [], prefixes: [] })),
  ref: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));

test('renders admin sidebar and designer dashboard', () => {
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );
  expect(screen.getByText(/Log Out/i)).toBeInTheDocument();
  expect(screen.getByText(/Designer Dashboard/i)).toBeInTheDocument();
});
