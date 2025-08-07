import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdminDashboard from './AdminDashboard';

// Utility to format month strings
const realGetMonthString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const currentDate = new Date();
const thisMonth = realGetMonthString(currentDate);
const nextDate = new Date(currentDate);
nextDate.setMonth(nextDate.getMonth() + 1);
const nextMonth = realGetMonthString(nextDate);
const mockNextMonth = nextMonth;
jest.mock('./utils/getMonthString.js', () => jest.fn(() => mockNextMonth));
jest.mock('./firebase/config', () => ({ db: {} }));

var mockGetDocs;
var mockGetDoc;
var mockDoc;
var mockCollection;
var mockQuery;
var mockWhere;
var mockGetCountFromServer;
var mockTimestamp;

jest.mock('firebase/firestore', () => {
  mockGetDocs = jest.fn();
  mockGetDoc = jest.fn();
  mockDoc = jest.fn();
  mockCollection = jest.fn();
  mockQuery = jest.fn();
  mockWhere = jest.fn();
  mockGetCountFromServer = jest.fn();
  mockTimestamp = { fromDate: jest.fn() };
  return {
    collection: (...args) => mockCollection(...args),
    getDocs: (...args) => mockGetDocs(...args),
    query: (...args) => mockQuery(...args),
    where: (...args) => mockWhere(...args),
    doc: (...args) => mockDoc(...args),
    getDoc: (...args) => mockGetDoc(...args),
    getCountFromServer: (...args) => mockGetCountFromServer(...args),
    Timestamp: mockTimestamp,
  };
});

jest.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: {
      getIdTokenResult: () => Promise.resolve({ claims: { admin: true } }),
    },
  }),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('recurring contract appears for next month', async () => {
  mockGetDocs
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [] });

  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({
      name: 'Test Brand',
      contracts: [
        {
          startDate: `${thisMonth}-01`,
          stills: 1,
          videos: 0,
          renews: true,
        },
      ],
    }),
  });

  render(
    <MemoryRouter>
      <AdminDashboard brandCodes={["BRAND1"]} />
    </MemoryRouter>
  );

  const brandCell = await screen.findByText('BRAND1');
  const row = brandCell.closest('tr');
  const cells = within(row).getAllByRole('cell');
  expect(cells[1]).toHaveTextContent('1');
});
