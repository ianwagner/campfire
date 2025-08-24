import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ProjectDetail from './ProjectDetail.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: { currentUser: {} } }));

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  writeBatch: jest.fn(),
  deleteDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
  addDoc: jest.fn(),
  setDoc: jest.fn(),
  Timestamp: { fromDate: jest.fn() },
  deleteField: jest.fn(),
}));

jest.mock('./components/OptimizedImage.jsx', () => () => <div />);
jest.mock('./components/RecipeTypeCard.jsx', () => () => <div />);
jest.mock('./RecipePreview.jsx', () => () => <div />);
jest.mock('./components/StatusBadge.jsx', () => () => <div />);
jest.mock('./components/VideoPlayer.jsx', () => () => <div />);
jest.mock('./components/PageWrapper.jsx', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/PageToolbar.jsx', () => () => <div />);
jest.mock('./LoadingOverlay.jsx', () => () => <div />);
jest.mock('./components/Button.jsx', () => (props) => <button {...props}>{props.children}</button>);
jest.mock('./components/IconButton.jsx', () => (props) => <button {...props}>{props.children}</button>);
jest.mock('./components/TabButton.jsx', () => (props) => <button {...props}>{props.children}</button>);
jest.mock('./components/common/Table.jsx', () => () => <div />);
jest.mock('./components/ShareLinkModal.jsx', () => () => <div />);
jest.mock('./components/Modal.jsx', () => ({ children }) => <div>{children}</div>);
jest.mock('./CopyRecipePreview.jsx', () => () => <div />);
jest.mock('react-icons/fi', () => ({
  FiLink: () => <div />, FiDownload: () => <div />, FiArchive: () => <div />, FiFile: () => <div />,
  FiPenTool: () => <div />, FiFileText: () => <div />, FiType: () => <div />, FiGrid: () => <div />, FiList: () => <div />, FiCheck: () => <div />,
}));
jest.mock('lucide-react', () => ({ Bubbles: () => <div /> }));
jest.mock('./utils/archiveGroup', () => jest.fn());
jest.mock('./utils/createArchiveTicket', () => jest.fn());
jest.mock('./utils/isVideoUrl', () => jest.fn());
jest.mock('./utils/stripVersion', () => jest.fn());
jest.mock('./utils/credits.js', () => ({ deductRecipeCredits: jest.fn() }));
jest.mock('./uploadFile.js', () => ({ uploadFile: jest.fn() }));
jest.mock('./components/DueDateMonthSelector.jsx', () => () => <div />);
jest.mock('./utils/computeGroupStatus', () => jest.fn());
jest.mock('./DescribeProjectModal.jsx', () => () => <div data-testid="describe-modal" />);

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
      recipeTypes: [],
      createdAt: { toDate: () => new Date() },
      status: 'need info',
    }),
  });
  mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
  mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
  mockGetDocs.mockResolvedValueOnce({
    empty: false,
    docs: [
      { id: 'r1', data: () => ({ status: 'need info', infoNote: 'Need details', title: 'P1', brandCode: 'B1' }) },
    ],
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('shows info needed section and opens modal', async () => {
  render(
    <MemoryRouter>
      <ProjectDetail />
    </MemoryRouter>
  );
  await waitFor(() => screen.getByText('Need details'));
  expect(screen.getByText('Need details')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Add Info'));
  expect(screen.getByTestId('describe-modal')).toBeInTheDocument();
});
