import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AgencySidebar from './AgencySidebar';

jest.mock('./useAgencyTheme', () => () => ({ agency: { logoUrl: '', name: 'Test Agency' } }));
jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
const navigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/current' }),
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

