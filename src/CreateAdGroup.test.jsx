import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CreateAdGroup from './CreateAdGroup';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve({ id: '1' })),
  serverTimestamp: jest.fn(),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

test('renders Create Ad Group heading', () => {
  render(
    <MemoryRouter>
      <CreateAdGroup brandCodes={['test']} />
    </MemoryRouter>
  );
  expect(screen.getByText(/Create Ad Group/i)).toBeInTheDocument();
});
