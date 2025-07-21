import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminSidebar from './AdminSidebar';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
const navigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/current' }),
}));

test('admin sidebar toggles width when collapse button clicked', () => {
  const { container } = render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  const sidebarDiv = container.querySelector('.border-r');
  expect(sidebarDiv).toHaveClass('w-[250px]');
  expect(sidebarDiv).toHaveClass('md:flex');
  fireEvent.click(screen.getByLabelText('Toggle sidebar'));
  expect(sidebarDiv).toHaveClass('w-16');
});

test('navigates to brands page when Brands clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Brands'));
  expect(navigate).toHaveBeenCalledWith('/admin/brands');
});

test('navigates to ad recipes page when Ad Recipes clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Settings'));
  fireEvent.click(screen.getByText('Ad Recipes'));
  expect(navigate).toHaveBeenCalledWith('/admin/ad-recipes');
});

test('renders Site Settings tab', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Settings'));
  expect(screen.getByText('Site Settings')).toBeInTheDocument();
});

test('renders Account Settings tab', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Settings'));
  expect(screen.getByText('Account Settings')).toBeInTheDocument();
});

test('renders Ad Recipes tab', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Settings'));
  expect(screen.getByText('Ad Recipes')).toBeInTheDocument();
});

test('renders Tickets tab', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  expect(screen.getByText('Tickets')).toBeInTheDocument();
});

test('renders Agencies tab', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  expect(screen.getByText('Agencies')).toBeInTheDocument();
});

test('renders Settings parent tab', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  expect(screen.getByText('Settings')).toBeInTheDocument();
});
