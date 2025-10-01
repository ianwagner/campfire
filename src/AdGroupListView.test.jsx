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
        groups={[{ id: '1', name: 'Group One', brandCode: 'BR', status: 'new', month: 1 }]}
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
          { id: '1', name: 'Group A', brandCode: 'ZZ', status: 'new', month: 1 },
          { id: '2', name: 'Group B', brandCode: 'AA', status: 'new', month: 1 },
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
        groups={[{ id: '1', name: 'Group One', brandCode: 'BR', status: 'new', month: 1, reviewVersion: 1 }]}
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
            status: 'new',
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
            status: 'new',
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
            status: 'new',
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
            status: 'new',
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

test('hides review type toggle when only one review type is available', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '1',
            name: 'Brief Only Group',
            brandCode: 'BR',
            status: 'new',
            month: 1,
            reviewVersion: 3,
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

  expect(
    screen.queryByRole('group', { name: 'Filter by review type' })
  ).not.toBeInTheDocument();
});

test('filters groups by review type when the toggle is used', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '1',
            name: 'Brief Group',
            brandCode: 'BR',
            status: 'new',
            month: 1,
            reviewVersion: 3,
          },
          {
            id: '2',
            name: 'Ads Group',
            brandCode: 'BR',
            status: 'new',
            month: 1,
            reviewVersion: 1,
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

  const toggleGroup = screen.getByRole('group', { name: 'Filter by review type' });
  expect(toggleGroup).toBeInTheDocument();

  const briefsButton = screen.getByRole('button', { name: 'Briefs' });
  const adsButton = screen.getByRole('button', { name: 'Ads' });
  const allButton = screen.getByRole('button', { name: 'All' });

  expect(briefsButton).toHaveAttribute('aria-pressed', 'false');
  expect(adsButton).toHaveAttribute('aria-pressed', 'false');
  expect(allButton).toHaveAttribute('aria-pressed', 'true');

  expect(screen.getByText('Brief Group')).toBeInTheDocument();
  expect(screen.getByText('Ads Group')).toBeInTheDocument();

  fireEvent.click(briefsButton);

  expect(screen.getByText('Brief Group')).toBeInTheDocument();
  expect(screen.queryByText('Ads Group')).not.toBeInTheDocument();

  fireEvent.click(adsButton);

  expect(screen.getByText('Ads Group')).toBeInTheDocument();
  expect(screen.queryByText('Brief Group')).not.toBeInTheDocument();

  fireEvent.click(allButton);

  expect(screen.getByText('Brief Group')).toBeInTheDocument();
  expect(screen.getByText('Ads Group')).toBeInTheDocument();
});

test('shows review type dropdown in kanban view when multiple review types are available', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '1',
            name: 'Brief Group',
            brandCode: 'BR',
            status: 'new',
            month: 1,
            reviewVersion: 3,
          },
          {
            id: '2',
            name: 'Ads Group',
            brandCode: 'BR',
            status: 'new',
            month: 1,
            reviewVersion: 1,
          },
        ]}
        loading={false}
        filter=""
        onFilterChange={() => {}}
        view="kanban"
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

  const dropdown = screen.getByLabelText('Review type');
  expect(dropdown).toBeInTheDocument();
  expect(dropdown).toHaveValue('all');

  fireEvent.change(dropdown, { target: { value: 'briefs' } });
  expect(dropdown).toHaveValue('briefs');

  fireEvent.change(dropdown, { target: { value: 'ads' } });
  expect(dropdown).toHaveValue('ads');
});

test('hides review type dropdown in kanban view when only one review type is available', () => {
  render(
    <MemoryRouter>
      <AdGroupListView
        groups={[
          {
            id: '1',
            name: 'Brief Only Group',
            brandCode: 'BR',
            status: 'new',
            month: 1,
            reviewVersion: 3,
          },
        ]}
        loading={false}
        filter=""
        onFilterChange={() => {}}
        view="kanban"
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

  expect(screen.queryByLabelText('Review type')).not.toBeInTheDocument();
});
