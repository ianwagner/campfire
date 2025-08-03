import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CreateAdGroup from './CreateAdGroup';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('./uploadFile.js', () => ({ uploadFile: jest.fn(() => Promise.resolve('url')) }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve({ id: '1' })),
  serverTimestamp: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  writeBatch: jest.fn(() => ({ set: jest.fn(), commit: jest.fn() })),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

test('renders Generate a Brief heading', () => {
  render(
    <MemoryRouter>
      <CreateAdGroup />
    </MemoryRouter>
  );
  expect(screen.getByText(/Generate a Brief/i)).toBeInTheDocument();
});

test('renders when sidebar hidden', () => {
  render(
    <MemoryRouter>
      <CreateAdGroup showSidebar={false} />
    </MemoryRouter>
  );
  expect(screen.getByText(/Generate a Brief/i)).toBeInTheDocument();
});
