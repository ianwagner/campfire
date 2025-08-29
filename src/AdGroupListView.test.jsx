import React from 'react';
import { render, screen } from '@testing-library/react';
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
