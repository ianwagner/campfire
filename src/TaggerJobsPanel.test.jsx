import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaggerJobsPanel from './TaggerJobsPanel.jsx';

const onSnapshot = jest.fn();
const collection = jest.fn();
const query = jest.fn();
const where = jest.fn();
const orderBy = jest.fn();

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args) => collection(...args),
  query: (...args) => query(...args),
  where: (...args) => where(...args),
  orderBy: (...args) => orderBy(...args),
  onSnapshot: (...args) => onSnapshot(...args),
}));

test('renders job progress', () => {
  onSnapshot.mockImplementation((q, cb) => {
    cb({
      forEach: (fn) =>
        fn({ id: '1', data: () => ({ driveFolderUrl: 'x', status: 'in_progress', total: 10, processed: 5, errors: [] }) }),
    });
    return () => {};
  });
  render(<TaggerJobsPanel onClose={() => {}} />);
  expect(screen.getByText('Tagging Jobs')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
