import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientProjects from './ClientProjects';

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(),
  doc: jest.fn(),
}));
jest.mock('./useSiteSettings', () => jest.fn(() => ({ settings: {}, loading: false })));
jest.mock('./RecipePreview.jsx', () => () => <div />);
jest.mock('./DescribeProjectModal.jsx', () => () => <div />);
jest.mock('./components/OptimizedImage.jsx', () => () => <div />);

import { onSnapshot } from 'firebase/firestore';

test('displays brand code when multiple brand codes provided', () => {
  onSnapshot
    .mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: 'p1',
            data: () => ({
              title: 'Project 1',
              brandCode: 'B1',
              status: 'new',
              createdAt: { toDate: () => new Date() },
            }),
          },
        ],
      });
      return jest.fn();
    })
    .mockImplementationOnce((q, cb) => {
      cb({ docs: [] });
      return jest.fn();
    });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1', 'B2']} />
    </MemoryRouter>
  );

  expect(screen.getByText('B1 - Project 1')).toBeInTheDocument();
});

