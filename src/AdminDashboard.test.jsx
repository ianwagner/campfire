import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminDashboard from './AdminDashboard.jsx';

jest.mock('./firebase/config', () => ({ db: {} }));

const mockGetDocs = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockCollectionGroup = jest.fn();
const mockGetCountFromServer = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  collectionGroup: (...args) => mockCollectionGroup(...args),
  getCountFromServer: (...args) => mockGetCountFromServer(...args),
}));

jest.mock('./components/PageWrapper.jsx', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/common/Table', () => ({ children }) => <table>{children}</table>);
jest.mock('./components/DateRangeSelector.jsx', () => () => null);

afterEach(() => {
  jest.clearAllMocks();
});

test('shows alert when asset count fetch is permission denied', async () => {
  mockGetDocs.mockResolvedValue({
    docs: [{ id: '1', data: () => ({ code: 'b1', counts: {} }) }],
  });
  mockGetCountFromServer.mockRejectedValue({ code: 'permission-denied' });

  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AdminDashboard />);

  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  expect(alertSpy.mock.calls[0][0]).toMatch(/asset counts couldn't be retrieved/i);

  alertSpy.mockRestore();
});
