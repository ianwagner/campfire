import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Sidebar from './Sidebar';

jest.mock('./firebase/config', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));

test('sidebar has md width class', () => {
  const { container } = render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
  const sidebarDiv = container.querySelector('.border-r');
  expect(sidebarDiv).toHaveClass('w-[250px]');
  expect(sidebarDiv).toHaveClass('md:flex');
});
