import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipePreview from './RecipePreview.jsx';
import normalizeAssetType from './utils/normalizeAssetType.js';

jest.mock('./firebase/config', () => ({ db: {} }));

const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => args,
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => args,
  where: (...args) => args,
}));

const mockUseUserRole = jest.fn(() => ({ role: 'admin', agencyId: null, loading: false }));
jest.mock('./useUserRole', () => (...args) => mockUseUserRole(...args));

afterEach(() => {
  jest.clearAllMocks();
  mockUseUserRole.mockImplementation(() => ({ role: 'admin', agencyId: null, loading: false }));
});

const typeSnap = { docs: [{ id: 't1', data: () => ({ name: 'Type1', components: ['headline'] }) }] };
const compSnap = { docs: [{ id: 'c1', data: () => ({ key: 'headline', label: 'Headline', attributes: [{ key: 'text', label: 'Text' }], selectionMode: 'dropdown' }) }] };
const instSnap = {
  docs: [
    { id: 'i1', data: () => ({ componentKey: 'headline', name: 'Default', values: { text: 'Default' }, relationships: {} }) },
    { id: 'i2', data: () => ({ componentKey: 'headline', name: 'Brand1', values: { text: 'B1' }, relationships: { brandCode: 'B1' } }) },
    { id: 'i3', data: () => ({ componentKey: 'headline', name: 'Brand2', values: { text: 'B2' }, relationships: { brandCode: 'B2' } }) },
  ],
};
const brandSnap = { docs: [{ id: 'b1', data: () => ({ code: 'B1', name: 'Brand1' }) }, { id: 'b2', data: () => ({ code: 'B2', name: 'Brand2' }) }] };

test('filters component instances by selected brand', async () => {
mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[1] || args[0][1] : args[1];
    switch (col) {
      case 'recipeTypes':
        return Promise.resolve(typeSnap);
      case 'componentTypes':
        return Promise.resolve(compSnap);
      case 'componentInstances':
        return Promise.resolve(instSnap);
      case 'brands':
        return Promise.resolve(brandSnap);
      default:
        return Promise.resolve({ docs: [] });
    }
  });

  render(<RecipePreview />);

  await waitFor(() => expect(mockGetDocs).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Type1' }));

  await waitFor(() => screen.getByLabelText('Brand'));
  fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'B1' } });

  await waitFor(() => screen.getByLabelText('Headline'));

  const options = screen.getAllByRole('option');
  const optionTexts = options.map((o) => o.textContent);
  expect(optionTexts).toContain('Default');
  expect(optionTexts).toContain('Brand1');
  expect(optionTexts).not.toContain('Brand2');
});

test('uses provided brandCode when brand select is hidden', async () => {
mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[1] || args[0][1] : args[1];
    switch (col) {
      case 'recipeTypes':
        return Promise.resolve(typeSnap);
      case 'componentTypes':
        return Promise.resolve(compSnap);
      case 'componentInstances':
        return Promise.resolve(instSnap);
      case 'brands':
        return Promise.resolve(brandSnap);
      default:
        return Promise.resolve({ docs: [] });
    }
  });

  render(<RecipePreview brandCode="B1" hideBrandSelect />);

  await waitFor(() => expect(mockGetDocs).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Type1' }));

  await waitFor(() => screen.getByLabelText('Headline'));

  expect(screen.queryByLabelText('Brand')).toBeNull();

  const options = screen.getAllByRole('option');
  const optionTexts = options.map((o) => o.textContent);
  expect(optionTexts).toContain('Default');
  expect(optionTexts).toContain('Brand1');
  expect(optionTexts).not.toContain('Brand2');
});

test('normalizeAssetType detects keywords within value', () => {
  expect(normalizeAssetType('still image')).toBe('image');
  expect(normalizeAssetType('my_static_photo')).toBe('image');
  expect(normalizeAssetType('Video Clip')).toBe('video');
  expect(normalizeAssetType('animated gif file')).toBe('video');
  expect(normalizeAssetType('unknown')).toBe('unknown');
});

test('allows saving without title when showOnlyResults is true', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  const onSave = jest.fn().mockResolvedValue();
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

  render(
    <RecipePreview
      onSave={onSave}
      showOnlyResults
      initialResults={[{ type: 'Type1', components: {} }]}
    />,
  );

  const toggleBtn = await screen.findByLabelText('Toggle Select');
  fireEvent.click(toggleBtn);

  const saveBtn = screen.getByLabelText('Save');
  fireEvent.click(saveBtn);

  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(alertSpy).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('allows saving without title when onTitleChange is not provided', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  const onSave = jest.fn().mockResolvedValue();
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

  render(
    <RecipePreview
      onSave={onSave}
      initialResults={[{ type: 'Type1', components: {} }]}
    />,
  );

  const toggleBtn = await screen.findByLabelText('Toggle Select');
  fireEvent.click(toggleBtn);

  const saveBtn = screen.getByLabelText('Save');
  fireEvent.click(saveBtn);

  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(alertSpy).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('hides add recipe button when showOnlyResults is true', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });

  render(
    <RecipePreview
      showOnlyResults
      initialResults={[{ type: 'Type1', components: {} }]}
    />,
  );

  await waitFor(() => expect(mockGetDocs).toHaveBeenCalled());

  expect(screen.queryByLabelText('Add Recipe Row')).toBeNull();
});

test('client users can manage layout assets', async () => {
  mockUseUserRole.mockReturnValue({ role: 'client', loading: false });
  mockGetDocs.mockResolvedValue({ docs: [] });
  const initialResults = [
    {
      type: 'Type1',
      components: {
        'layout.assets': [
          { id: 'a1', assetType: 'image', firebaseUrl: 'http://example.com/a1.jpg' },
          { needAsset: true },
        ],
      },
    },
  ];
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});

  render(<RecipePreview initialResults={initialResults} />);

  const assetBtn = await screen.findAllByLabelText('Asset');
  fireEvent.click(assetBtn[0]);
  expect(openSpy).toHaveBeenCalledTimes(1);

  const editBtn = await screen.findByLabelText('Edit');
  fireEvent.click(editBtn);

  expect(screen.getByLabelText('Remove Asset')).toBeInTheDocument();
  expect(screen.getByLabelText('Add Asset')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Need asset' })).toBeInTheDocument();

  fireEvent.click(screen.getAllByLabelText('Asset')[0]);
  expect(openSpy).toHaveBeenCalledTimes(1);

  openSpy.mockRestore();
});

test('editor users have access to row action buttons', async () => {
  mockUseUserRole.mockReturnValue({ role: 'editor', loading: false });
  mockGetDocs.mockResolvedValue({ docs: [] });
  render(<RecipePreview initialResults={[{ type: 'Type1', components: {} }]} />);

  const editBtn = await screen.findByLabelText('Edit');
  expect(editBtn).toBeInTheDocument();
  expect(screen.getByLabelText('Refresh')).toBeInTheDocument();
  expect(screen.getByLabelText('Delete')).toBeInTheDocument();
  expect(screen.queryByLabelText('Toggle Select')).toBeNull();
});

test('hides actions and refine button when hideActions is true', async () => {
  mockGetDocs.mockResolvedValue({ docs: [] });
  render(
    <RecipePreview
      initialResults={[{ type: 'Type1', components: {} }]}
      showOnlyResults
      hideActions
    />,
  );
  await waitFor(() => expect(mockGetDocs).toHaveBeenCalled());
  expect(screen.queryByText('Refine')).toBeNull();
  expect(screen.queryByLabelText('Toggle Select')).toBeNull();
});

test('updates recipe column visibility when user role changes', async () => {
  let role = 'designer';
  mockUseUserRole.mockImplementation(() => ({ role, agencyId: null, loading: false }));

  const typeSnap = {
    docs: [
      {
        id: 'type1',
        data: () => ({
          name: 'Type1',
          components: ['headline'],
          designerVisibleColumns: ['recipeNo', 'headline.text'],
          clientVisibleColumns: ['headline.text'],
          defaultColumns: ['recipeNo', 'headline.text'],
        }),
      },
    ],
  };

  const componentSnap = {
    docs: [
      {
        id: 'headline',
        data: () => ({
          key: 'headline',
          label: 'Headline',
          selectionMode: 'dropdown',
          attributes: [{ key: 'text', label: 'Text' }],
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[1] || args[0][1] : args[1];
    switch (col) {
      case 'recipeTypes':
        return Promise.resolve(typeSnap);
      case 'componentTypes':
        return Promise.resolve(componentSnap);
      case 'componentInstances':
        return Promise.resolve({ docs: [] });
      case 'brands':
        return Promise.resolve({ docs: [] });
      default:
        return Promise.resolve({ docs: [] });
    }
  });

  const initialResults = [
    {
      type: 'type1',
      recipeNo: 7,
      components: { 'headline.text': 'Hello' },
    },
  ];

  const { rerender } = render(
    <RecipePreview initialResults={initialResults} showOnlyResults />,
  );

  await waitFor(() =>
    expect(
      screen.getByRole('columnheader', {
        name: '#',
      }),
    ).toBeInTheDocument(),
  );

  role = 'client';
  rerender(<RecipePreview initialResults={initialResults} showOnlyResults />);

  await waitFor(() =>
    expect(
      screen.queryByRole('columnheader', {
        name: '#',
      }),
    ).not.toBeInTheDocument(),
  );
});

