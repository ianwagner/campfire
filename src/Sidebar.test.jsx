import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import SidebarBase from './components/SidebarBase';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));

const tabs = [{ label: 'Dashboard', path: '/dashboard' }];

test('sidebar has md width class', () => {
  const { container } = render(
    <MemoryRouter>
      <SidebarBase tabs={tabs} />
    </MemoryRouter>
  );
  const sidebarDiv = container.querySelector('.border-r');
  expect(sidebarDiv).toHaveClass('w-[250px]');
  expect(sidebarDiv).toHaveClass('md:flex');
});
