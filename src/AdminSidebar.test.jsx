import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminSidebar from './AdminSidebar';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
jest.mock('./utils/debugLog', () => jest.fn());
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/current' }),
}));

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1300,
  });
});

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

test('collapses by default when screen width is below 1200px', () => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1000,
  });
  const { container } = render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  const sidebarDiv = container.querySelector('.border-r');
  expect(sidebarDiv).toHaveClass('w-16');
});

test('shows short copyright when collapsed', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByLabelText('Toggle sidebar'));
  expect(screen.getByText(/© 2025/)).toBeInTheDocument();
});

test('shows full copyright when expanded', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  expect(
    screen.getByText('© 2025 Studio Tak. All rights reserved.')
  ).toBeInTheDocument();
});

test('navigates to brands page when Brands clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Brands'));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/brands');
});

test('navigates to distribution page when Distribution clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Distribution'));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/distribution');
});

test('navigates to forms page when Forms clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Forms'));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/forms');
});

test('navigates to ad recipes page when Ad Recipes clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Settings'));
  fireEvent.click(screen.getByText('Ad Recipes'));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/ad-recipes');
});

test('navigates to dynamic headlines page when Dynamic Headlines clicked', () => {
  render(
    <MemoryRouter>
      <AdminSidebar />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('Settings'));
  fireEvent.click(screen.getByText('Dynamic Headlines'));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/dynamic-headlines');
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
