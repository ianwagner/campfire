import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('./firebase/config', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn((...args) => args),
  updateDoc: jest.fn(),
  where: jest.fn(),
}));

import { getDocs, updateDoc, doc } from 'firebase/firestore';
import ClientData from './ClientData';

beforeEach(() => {
  getDocs.mockResolvedValue({ docs: [] });
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- Shared happy-path edit test (kept from both branches) ---

test('saves edited values to metadata', async () => {
  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({
            month: '2023-09',
            dueDate: new Date('2023-09-15'),
            brandCode: 'BR1',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({ name: 'Group1', brandCode: 'BR1', metadata: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [{ data: () => ({ storeId: '' }) }],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'r1',
          data: () => ({ metadata: { url: 'old' }, components: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [] });

  doc.mockReturnValue('docRef');

  render(<ClientData brandCodes={['BR1']} />);

  await screen.findAllByRole('option', { name: 'Sep 2023' });
  await screen.findByRole('option', { name: 'BR1' });

  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[2], { target: { value: 'BR1' } });
  fireEvent.change(selects[0], { target: { value: '2023-09' } });

  await screen.findByText('Group1');

  fireEvent.click(screen.getByLabelText('Edit'));
  const input = screen.getByDisplayValue('old');
  fireEvent.change(input, { target: { value: 'new' } });
  fireEvent.click(screen.getByLabelText('Save'));

  await waitFor(() =>
    expect(updateDoc).toHaveBeenCalledWith('docRef', { 'metadata.url': 'new' })
  );
});

// --- From staging: scroll wheel delegates to window scrolling ---

test('scrolling the filters delegates to window scrolling', async () => {
  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({
            month: '2023-09',
            dueDate: new Date('2023-09-15'),
            brandCode: 'BR1',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({ name: 'Group1', brandCode: 'BR1', metadata: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({
      // staging branch expected no store connection
      docs: [{ data: () => ({ storeId: '' }) }],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'r1',
          data: () => ({ metadata: { url: 'old' }, components: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [] });

  render(<ClientData brandCodes={['BR1']} />);

  const selects = await screen.findAllByRole('combobox');
  fireEvent.change(selects[2], { target: { value: 'BR1' } });
  fireEvent.change(selects[0], { target: { value: '2023-09' } });

  await screen.findByText('Group1');

  const scrollBySpy = jest.spyOn(window, 'scrollBy').mockImplementation(() => {});
  fireEvent.wheel(selects[2], { deltaY: 120, deltaX: 0 });
  expect(scrollBySpy).toHaveBeenCalledWith({ top: 120, left: 0, behavior: 'auto' });
  scrollBySpy.mockRestore();
});

// --- From main: richer asset-link preservation and aspect-ratio handling ---

test('preserves asset links after saving edits', async () => {
  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({
            month: '2023-09',
            dueDate: new Date('2023-09-15'),
            brandCode: 'BR1',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({ name: 'Group1', brandCode: 'BR1', metadata: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [{ data: () => ({ storeId: 'store-123' }) }],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'r1',
          data: () => ({
            recipeNo: '001',
            metadata: { angle: 'Angle One', url: 'https://example.com/r1' },
            components: {},
            product: { name: 'Product A' },
            status: 'approved',
          }),
        },
        {
          id: 'r2',
          data: () => ({
            recipeNo: '002',
            metadata: { angle: 'Angle Two', url: 'https://example.com/r2' },
            components: {},
            product: { name: 'Product B' },
            status: 'approved',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            filename: 'BR1_GROUP1_001_9x16.png',
            recipeCode: '001',
            adUrl: 'https://example.com/r1-9x16',
            status: 'approved',
          }),
        },
        {
          data: () => ({
            filename: 'BR1_GROUP1_002_9x16.png',
            recipeCode: '002',
            adUrl: 'https://example.com/r2-9x16',
            status: 'approved',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({ docs: [] });

  doc.mockImplementation(() => 'docRef');
  updateDoc.mockResolvedValue();

  render(<ClientData brandCodes={['BR1']} />);

  await screen.findAllByRole('option', { name: 'Sep 2023' });
  await screen.findByRole('option', { name: 'BR1' });

  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[2], { target: { value: 'BR1' } });
  fireEvent.change(selects[0], { target: { value: '2023-09' } });

  await screen.findAllByRole('cell', { name: 'Group1' });

  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: 'Link' })).toHaveLength(2),
  );

  fireEvent.click(screen.getByLabelText('Edit'));

  const angleInput = screen.getByDisplayValue('Angle One');
  fireEvent.change(angleInput, { target: { value: 'Updated Angle' } });

  fireEvent.click(screen.getByLabelText('Save'));

  await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByLabelText('Edit')).toBeEnabled());

  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: 'Link' });
    expect(links).toHaveLength(2);
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        'https://example.com/r1-9x16',
        'https://example.com/r2-9x16',
      ]),
    );
  });
});

test('populates asset columns for normalized aspect ratios', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({
            month: '2023-09',
            dueDate: new Date('2023-09-15'),
            brandCode: 'BR1',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({ name: 'Group1', brandCode: 'BR1', metadata: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [{ data: () => ({ storeId: 'store-123' }) }],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'r1',
          data: () => ({
            recipeNo: '001',
            product: { name: 'Product A' },
            metadata: {},
            components: {},
            status: 'active',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            filename: 'BR1_GROUP1_001_1X1S_V2.png',
            recipeCode: '001',
            adUrl: 'https://example.com/1x1',
            status: 'approved',
          }),
        },
        {
          data: () => ({
            filename: 'BR1_GROUP1_001_4x5.png',
            recipeCode: '001',
            firebaseUrl: 'https://example.com/4x5',
            aspectRatio: 'portrait',
            status: 'approved',
          }),
        },
        {
          data: () => ({
            filename: 'BR1_GROUP1_001_9x16.png',
            recipeCode: '001',
            adUrl: 'https://example.com/9x16',
            aspectRatio: ' 9X16S ',
            status: 'approved',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({ docs: [] });

  render(<ClientData brandCodes={['BR1']} />);

  await screen.findAllByRole('option', { name: 'Sep 2023' });
  await screen.findByRole('option', { name: 'BR1' });

  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[2], { target: { value: 'BR1' } });
  fireEvent.change(selects[0], { target: { value: '2023-09' } });
  expect(selects[0].value).toBe('2023-09');
  expect(selects[2].value).toBe('BR1');

  await screen.findByText('Group1');

  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: 'Link' });
    expect(links).toHaveLength(3);
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        'https://example.com/1x1',
        'https://example.com/4x5',
        'https://example.com/9x16',
      ]),
    );
  });
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

test('matches assets when recipe numbers include leading zeros', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({
            month: '2023-09',
            dueDate: new Date('2023-09-15'),
            brandCode: 'BR1',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({ name: 'Group1', brandCode: 'BR1', metadata: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [{ data: () => ({ storeId: 'store-123' }) }],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'r1',
          data: () => ({
            recipeNo: '001',
            product: { name: 'Product A' },
            metadata: {},
            components: {},
            status: 'active',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            filename: 'BR1_GROUP1_1_9x16.png',
            recipeCode: '1',
            adUrl: 'https://example.com/normalized-9x16',
            status: 'approved',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({ docs: [] });

  render(<ClientData brandCodes={['BR1']} />);

  await screen.findAllByRole('option', { name: 'Sep 2023' });
  await screen.findByRole('option', { name: 'BR1' });

  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[2], { target: { value: 'BR1' } });
  fireEvent.change(selects[0], { target: { value: '2023-09' } });

  await screen.findByText('Group1');

  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute(
      'href',
      'https://example.com/normalized-9x16',
    ),
  );

  errorSpy.mockRestore();
});

test('treats missing aspect ratios as 9x16', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getDocs
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({
            month: '2023-09',
            dueDate: new Date('2023-09-15'),
            brandCode: 'BR1',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'g1',
          data: () => ({ name: 'Group1', brandCode: 'BR1', metadata: {} }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [{ data: () => ({ storeId: 'store-123' }) }],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          id: 'r1',
          data: () => ({
            recipeNo: '001',
            product: { name: 'Product A' },
            metadata: {},
            components: {},
            status: 'active',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            filename: 'BR1_GROUP1_001__V1.png',
            recipeCode: '001',
            firebaseUrl: 'https://example.com/9x16-missing',
            status: 'approved',
          }),
        },
      ],
    })
    .mockResolvedValueOnce({ docs: [] });

  render(<ClientData brandCodes={['BR1']} />);

  await screen.findAllByRole('option', { name: 'Sep 2023' });
  await screen.findByRole('option', { name: 'BR1' });

  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[2], { target: { value: 'BR1' } });
  fireEvent.change(selects[0], { target: { value: '2023-09' } });

  await screen.findByText('Group1');

  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute(
      'href',
      'https://example.com/9x16-missing',
    ),
  );

  errorSpy.mockRestore();
});

