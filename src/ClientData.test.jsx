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

afterEach(() => jest.clearAllMocks());

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

  const selects = await screen.findAllByRole('combobox');
  fireEvent.change(selects[0], { target: { value: '2023-09' } });
  fireEvent.change(selects[2], { target: { value: 'BR1' } });

  await screen.findByText('Group1');

  fireEvent.click(screen.getByLabelText('Edit'));
  const input = screen.getByDisplayValue('old');
  fireEvent.change(input, { target: { value: 'new' } });
  fireEvent.click(screen.getByLabelText('Save'));

  await waitFor(() =>
    expect(updateDoc).toHaveBeenCalledWith('docRef', { 'metadata.url': 'new' })
  );
});

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
  fireEvent.change(selects[0], { target: { value: '2023-09' } });
  fireEvent.change(selects[2], { target: { value: 'BR1' } });

  await screen.findByText('Group1');

  const scrollBySpy = jest.spyOn(window, 'scrollBy').mockImplementation(() => {});

  fireEvent.wheel(selects[2], { deltaY: 120, deltaX: 0 });

  expect(scrollBySpy).toHaveBeenCalledWith({ top: 120, left: 0, behavior: 'auto' });

  scrollBySpy.mockRestore();
});
