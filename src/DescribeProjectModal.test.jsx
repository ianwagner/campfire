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
}));
jest.mock('./components/ScrollModal.jsx', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/InfoTooltip.jsx', () => () => <div />);
jest.mock('./components/UrlCheckInput.jsx', () => (props) => (
  <input {...props} />
));
jest.mock('./useUserRole', () => () => ({ role: null, agencyId: null }));
jest.mock('./useSiteSettings', () => jest.fn(() => ({ settings: {}, loading: false })));

test('alerts when saving without a title', () => {
  window.alert = jest.fn();
  render(<DescribeProjectModal onClose={jest.fn()} brandCodes={['B1']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(window.alert).toHaveBeenCalledWith('Please enter a title before saving.');
});
