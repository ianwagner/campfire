import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupListView from './components/AdGroupListView.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('./useUserRole', () => () => ({ role: 'project-manager' }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

const firestore = require('firebase/firestore');

beforeEach(() => {
  firestore.doc.mockClear();
  firestore.updateDoc.mockClear();
});

test('renders link to ad group detail when linkToDetail is true', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[{ id: '1', name: 'Group One', brandCode: 'BR', status: 'processing', month: 1 }]}
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
          { id: '1', name: 'Group A', brandCode: 'ZZ', status: 'processing', month: 1 },
          { id: '2', name: 'Group B', brandCode: 'AA', status: 'processing', month: 1 },
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

test('allows updating review type from the list view', async () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[{ id: '1', name: 'Group One', brandCode: 'BR', status: 'processing', month: 1, reviewVersion: 1 }]}
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

  const select = screen.getByLabelText('Review type for Group One');
  expect(select.value).toBe('1');
  fireEvent.change(select, { target: { value: '2' } });

  await waitFor(() =>
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), { reviewVersion: 2 })
  );
  expect(firestore.doc).toHaveBeenCalledWith({}, 'adGroups', '1');
  expect(select.value).toBe('2');
});

test('normalizes non-numeric review type values', async () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '1',
            name: 'Group One',
            brandCode: 'BR',
            status: 'processing',
            month: 1,
            reviewVersion: 'brief type',
          },
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

  const select = screen.getByLabelText('Review type for Group One');
  expect(select.value).toBe('3');

  fireEvent.change(select, { target: { value: '1' } });

  await waitFor(() =>
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), { reviewVersion: 1 })
  );
  expect(firestore.doc).toHaveBeenCalledWith({}, 'adGroups', '1');
  expect(select.value).toBe('1');
});
