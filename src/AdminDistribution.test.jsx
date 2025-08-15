import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminDistribution from './AdminDistribution';

jest.mock('./firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
}));

import { getDocs } from 'firebase/firestore';

test('allows selecting months up to six months in the future', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  render(<AdminDistribution />);
  const future = new Date();
  future.setDate(1);
  future.setMonth(future.getMonth() + 6);
  const label = future.toLocaleString('default', { month: 'short', year: 'numeric' });
  const selects = await screen.findAllByRole('combobox');
  const dueSelect = selects[1];
  expect(within(dueSelect).getByRole('option', { name: label })).toBeInTheDocument();
});
