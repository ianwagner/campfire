import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ProjectStaging from './ProjectStaging';

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
}));

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockDeleteDoc = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn();
const mockOnSnapshot = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => args.slice(1).join('/'),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
}));

jest.mock('./DescribeProjectModal.jsx', () => () => <div />);

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ projectId: 'p1' }),
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    id: 'p1',
    data: () => ({
      title: 'P1',
      brandCode: 'B1',
      createdAt: { toDate: () => new Date() },
    }),
  });
  mockGetDocs.mockResolvedValue({
    empty: false,
    docs: [
      {
        id: 'r1',
        data: () => ({
          title: 'P1',
          brandCode: 'B1',
          dueDate: { toDate: () => new Date() },
          numAds: 1,
        }),
      },
    ],
  });
  mockOnSnapshot.mockImplementation((q, cb) => {
    cb({ empty: true });
    return jest.fn();
  });
  mockDeleteDoc.mockResolvedValue();
  mockNavigate.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

test('deletes project and request and navigates back', async () => {
  window.confirm = jest.fn(() => true);
  render(
    <MemoryRouter>
      <ProjectStaging />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Delete'));
  await waitFor(() => expect(mockDeleteDoc).toHaveBeenCalledTimes(2));
  expect(mockDeleteDoc.mock.calls[0][0]).toBe('projects/p1');
  expect(mockDeleteDoc.mock.calls[1][0]).toBe('requests/r1');
  expect(mockNavigate).toHaveBeenCalledWith('/projects', {
    replace: true,
    state: { removedProject: 'p1' },
  });
});
