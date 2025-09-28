import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientProjects from './ClientProjects';
import CreateAdGroup from './CreateAdGroup.jsx';

jest.mock('./CreateAdGroup.jsx', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="create-ad-group" />),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('shows upgrade message linking to ad groups', () => {
  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1', 'B2']} />
    </MemoryRouter>
  );

  expect(screen.getByText(/Projects have been upgraded/i)).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /Ad Groups/i });
  expect(link).toHaveAttribute('href', '/ad-groups');
  expect(screen.getByTestId('create-ad-group')).toBeInTheDocument();
});

test('passes provided brand codes to CreateAdGroup', () => {
  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['BR1']} />
    </MemoryRouter>
  );

  expect(CreateAdGroup).toHaveBeenCalledWith(
    expect.objectContaining({ brandCodes: ['BR1'], asModal: true }),
    {}
  );
});
