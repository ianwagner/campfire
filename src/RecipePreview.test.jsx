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

const mockUseUserRole = jest.fn(() => ({ role: 'admin', loading: false }));
jest.mock('./useUserRole', () => (...args) => mockUseUserRole(...args));

afterEach(() => {
  jest.clearAllMocks();
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

