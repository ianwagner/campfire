import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupListView from './components/AdGroupListView.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('./useUserRole', () => () => ({ role: 'project-manager' }));

test('renders link to ad group detail when linkToDetail is true', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[{ id: '1', name: 'Group One', brandCode: 'BR', status: 'pending', month: 1 }]}
        loading={false}
        filter=""
        onFilterChange={() => {}}
        view="table"
        onViewChange={() => {}}
        showArchived={false}
        onToggleArchived={() => {}}
        onGallery={() => {}}
        onCopy={() => {}}
        onDownload={() => {}}
        linkToDetail
      />
    </MemoryRouter>
  );
  const link = screen.getByRole('link', { name: 'Group One' });
  expect(link).toHaveAttribute('href', '/ad-group/1');
});

test('sorts groups by brand when selected', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          { id: '1', name: 'Group A', brandCode: 'ZZ', status: 'pending', month: 1 },
          { id: '2', name: 'Group B', brandCode: 'AA', status: 'pending', month: 1 },
        ]}
        loading={false}
        filter=""
        onFilterChange={() => {}}
        view="table"
        onViewChange={() => {}}
        showArchived={false}
        onToggleArchived={() => {}}
        onGallery={() => {}}
        onCopy={() => {}}
        onDownload={() => {}}
        linkToDetail
      />
    </MemoryRouter>
  );
  let rows = screen.getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Group A');
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'brand' } });
  rows = screen.getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Group B');
});
