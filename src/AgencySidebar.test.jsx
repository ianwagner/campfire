import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AgencySidebar from './AgencySidebar';

jest.mock('./useAgencyTheme', () => () => ({ agency: { logoUrl: '', name: 'Test Agency' } }));
jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
const navigate = jest.fn();
let location = { pathname: '/current', search: '' };
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
  useLocation: () => location,
}));

test('agency sidebar has md width class', () => {
  const { container } = render(
    <MemoryRouter>
      <AgencySidebar />
    </MemoryRouter>
  );
  const sidebarDiv = container.querySelector('.border-r');
  expect(sidebarDiv).toHaveClass('w-[250px]');
  expect(sidebarDiv).toHaveClass('md:flex');
});

test('dashboard tab is active when query matches', () => {
  location = { pathname: '/agency/dashboard', search: '?agencyId=123' };
  const { getByText } = render(
    <MemoryRouter>
      <AgencySidebar agencyId="123" />
    </MemoryRouter>
  );
  const btn = getByText('Dashboard');
  expect(btn).toHaveClass('text-accent');
});

