import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DescribeProjectModal from './DescribeProjectModal.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: { currentUser: {} } }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  doc: jest.fn(),
  serverTimestamp: jest.fn(),
  Timestamp: { fromDate: jest.fn() },
  deleteField: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
  query: jest.fn(),
  where: jest.fn(),
}));
jest.mock('./components/ScrollModal.jsx', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/InfoTooltip.jsx', () => () => <div />);
jest.mock('./components/UrlCheckInput.jsx', () => (props) => (
  <input {...props} />
));
jest.mock('./useUserRole', () => () => ({ role: null, agencyId: null }));

test('alerts when saving without a title', () => {
  window.alert = jest.fn();
  render(<DescribeProjectModal onClose={jest.fn()} brandCodes={['B1']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(window.alert).toHaveBeenCalledWith('Please enter a title before saving.');
});

test('shows info needed note when provided', () => {
  render(
    <DescribeProjectModal
      onClose={jest.fn()}
      brandCodes={['B1']}
      request={{ infoNote: 'Need assets' }}
    />
  );
  expect(
    screen.getByText('Info Needed: Need assets')
  ).toBeInTheDocument();
});
