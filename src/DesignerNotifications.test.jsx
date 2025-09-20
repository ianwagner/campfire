import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import DesignerNotifications from './DesignerNotifications';

jest.mock('./firebase/config', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  orderBy: jest.fn(),
}));

import { getDocs, where } from 'firebase/firestore';

describe('DesignerNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('splits notification queries into chunks for large brand lists', async () => {
    const brandCodes = Array.from({ length: 11 }, (_, i) => `B${i + 1}`);

    const createDoc = (id, title, createdAt) => ({
      id,
      data: () => ({
        title,
        body: `${title} body`,
        createdAt: { toDate: () => new Date(createdAt) },
        url: null,
      }),
    });

    getDocs
      .mockResolvedValueOnce({ docs: [createDoc('n1', 'Note 1', '2024-01-02')] })
      .mockResolvedValueOnce({ docs: [createDoc('n2', 'Note 2', '2024-01-03')] });

    render(
      <MemoryRouter>
        <DesignerNotifications brandCodes={brandCodes} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Note 2')).toBeInTheDocument();
    expect(screen.getByText('Note 1')).toBeInTheDocument();

    const brandWhereCalls = where.mock.calls.filter(
      (call) => call[0] === 'brandCode' && call[1] === 'in'
    );
    expect(brandWhereCalls).toHaveLength(2);
    expect(brandWhereCalls[0][2]).toEqual(brandCodes.slice(0, 10));
    expect(brandWhereCalls[1][2]).toEqual(brandCodes.slice(10));
  });
});
