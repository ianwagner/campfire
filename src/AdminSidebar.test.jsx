import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminSidebar from './AdminSidebar';

jest.mock('./firebase/config', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
const navigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/current' }),
}));

test('admin sidebar has md width class', () => {
  const { container } = render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  const sidebarDiv = container.querySelector('.border-r');
  expect(sidebarDiv).toHaveClass('w-[250px]');
  expect(sidebarDiv).toHaveClass('md:flex');
});

test('navigates to designer dashboard when Create Brand clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Create Brand'));
  expect(navigate).toHaveBeenCalledWith('/dashboard/designer');
});
