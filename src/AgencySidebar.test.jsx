import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AgencySidebar from './AgencySidebar';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));

jest.mock('./useAgencyTheme', () => () => ({
  agency: { logoUrl: 'test.png', name: 'Test' },
}));

test('displays agency logo from theme', () => {
  render(
    <MemoryRouter>
      <AgencySidebar agencyId="1" />
    </MemoryRouter>
  );
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', 'test.png');
  expect(img).toHaveAttribute('alt', 'Test logo');
});
