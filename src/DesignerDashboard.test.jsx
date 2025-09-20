import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('./components/AdGroupCard.jsx', () => ({ group }) => (
  <div data-testid="ad-group">{group.name}</div>
));
jest.mock('./utils/parseAdFilename', () => jest.fn(() => ({ recipeCode: 'R1' })));
jest.mock('./utils/getUserName', () => jest.fn(async () => 'User'));
jest.mock('./utils/computeKanbanStatus', () => jest.fn(() => 'new'));
jest.mock('./components/ShareLinkModal.jsx', () => () => null);
jest.mock('./useUserRole', () => jest.fn());

jest.mock('./firebase/config', () => ({
  auth: { currentUser: { uid: 'designer1', email: 'designer@example.com' } },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  updateDoc: jest.fn(),
  doc: jest.fn(),
}));

import DesignerDashboard from './DesignerDashboard';
import { getDocs, where } from 'firebase/firestore';
import useUserRole from './useUserRole';

describe('DesignerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches ad groups in chunks when designer has many brands', async () => {
    const brandCodes = Array.from({ length: 11 }, (_, i) => `B${i + 1}`);
    useUserRole.mockReturnValue({ role: 'manager', brandCodes });

    const makeDoc = (id, brandCode) => ({
      id,
      data: () => ({
        brandCode,
        status: 'ready',
        visibility: 'public',
        name: `Group ${id}`,
      }),
    });

    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('g1', 'B1')] })
      .mockResolvedValueOnce({ docs: [makeDoc('g2', 'B11')] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    render(<DesignerDashboard />);

    const groups = await screen.findAllByTestId('ad-group');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const names = groups.map((g) => g.textContent);
    expect(new Set(names)).toEqual(new Set(['Group g1', 'Group g2']));

    const brandWhereCalls = where.mock.calls.filter(
      (call) => call[0] === 'brandCode' && call[1] === 'in'
    );
    expect(brandWhereCalls).toHaveLength(2);
    expect(brandWhereCalls[0][2]).toEqual(brandCodes.slice(0, 10));
    expect(brandWhereCalls[1][2]).toEqual(brandCodes.slice(10));
  });
});
