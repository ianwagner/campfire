import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AgencySidebar from './AgencySidebar';

jest.mock('./useAgencyTheme', () => {
  const React = require('react');
  const { applyAccentColor } = require('./utils/theme');
  return () => {
    React.useEffect(() => {
      applyAccentColor('#123456');
    }, []);
    return { agency: { logoUrl: 'logo.png', name: 'Test Agency', themeColor: '#123456' } };
  };
});
jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/current', search: '' }),
  };
});

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1300,
  });
});

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

test('accent color uses agency theme on render', () => {
  render(
    <MemoryRouter>
      <AgencySidebar agencyId="123" />
    </MemoryRouter>
  );
  expect(
    document.documentElement.style.getPropertyValue('--accent-color')
  ).toBe('#123456');
});

test('renders Account Settings tab', () => {
  const { getByText } = render(
    <MemoryRouter>
      <AgencySidebar agencyId="123" />
    </MemoryRouter>
  );
  expect(getByText('Account Settings')).toBeInTheDocument();
});

test('agency logo container has max-height 90px', () => {
  const { container } = render(
    <MemoryRouter>
      <AgencySidebar agencyId="123" />
    </MemoryRouter>
  );
  const logoDiv = container.querySelector('.max-h-\\[90px\\]');
  expect(logoDiv).toBeInTheDocument();
});

