import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupListView from './components/AdGroupListView.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('./useUserRole', () => () => ({ role: 'project-manager' }));
jest.mock('./useSiteSettings', () => () => ({}));
jest.mock('./components/AdGroupCard.jsx', () => () => null);
jest.mock('./components/MonthTag.jsx', () => () => null);
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

test('falls back to brief when review type is stored as a labeled object', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '2',
            name: 'Group Two',
            brandCode: 'BR',
            status: 'processing',
            month: 1,
            reviewVersion: { label: 'Brief Type', value: 'brief type' },
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

  const select = screen.getByLabelText('Review type for Group Two');
  expect(select.value).toBe('3');
});

test('normalizes 3.0 review version strings to the brief option', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '3',
            name: 'Group Three',
            brandCode: 'BR',
            status: 'processing',
            month: 1,
            reviewVersion: '3.0',
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

  const select = screen.getByLabelText('Review type for Group Three');
  expect(select.value).toBe('3');
  const briefOption = within(select).getByRole('option', { name: 'Brief' });
  expect(briefOption.selected).toBe(true);
});

test('normalizes nested review version values containing v3 to the brief option', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '4',
            name: 'Group Four',
            brandCode: 'BR',
            status: 'processing',
            month: 1,
            reviewVersion: { value: 'v3' },
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

  const select = screen.getByLabelText('Review type for Group Four');
  expect(select.value).toBe('3');
  const briefOption = within(select).getByRole('option', { name: 'Brief' });
  expect(briefOption.selected).toBe(true);
});
