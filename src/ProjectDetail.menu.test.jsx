import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ProjectDetail from './ProjectDetail.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: { currentUser: {} } }));
jest.mock('./useUserRole', () => () => ({ role: null }));

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockCollection = jest.fn((...args) => args);
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockOnSnapshot = jest.fn(() => jest.fn());

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
  onSnapshot: (...args) => mockOnSnapshot(...args),
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
jest.mock('./components/common/Table.jsx', () => ({ children }) => <table>{children}</table>);
jest.mock('./components/ShareLinkModal.jsx', () => () => <div />);
jest.mock('./components/Modal.jsx', () => ({ children }) => <div>{children}</div>);
jest.mock('./CopyRecipePreview.jsx', () => () => <div />);
jest.mock('react-icons/fi', () => ({
  FiLink: () => <div />,
  FiDownload: () => <div />,
  FiArchive: () => <div />,
  FiFile: () => <div />,
  FiPenTool: () => <div />,
  FiFileText: () => <div />,
  FiType: () => <div />,
  FiGrid: () => <div />,
  FiList: () => <div />,
  FiCheck: () => <div />,
  FiEye: () => <div />,
  FiEyeOff: () => <div />,
  FiMoreHorizontal: () => <div />,
  FiRefreshCw: () => <div />,
  FiClock: () => <div />,
}));
jest.mock('lucide-react', () => ({ Bubbles: () => <div /> }));
jest.mock('./utils/archiveGroup', () => jest.fn());
jest.mock('./utils/createArchiveTicket', () => jest.fn());
jest.mock('./utils/isVideoUrl', () => jest.fn(() => false));
jest.mock('./utils/stripVersion', () => jest.fn());
jest.mock('./utils/credits.js', () => ({ deductRecipeCredits: jest.fn() }));
jest.mock('./uploadFile.js', () => ({ uploadFile: jest.fn() }));
jest.mock('./components/DueDateMonthSelector.jsx', () => () => <div />);
jest.mock('./utils/computeGroupStatus', () => jest.fn(() => 'pending'));
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
      recipeTypes: [],
      createdAt: { toDate: () => new Date() },
      status: 'pending',
    }),
  });

  mockGetDocs
    .mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'g1', data: () => ({ status: 'pending', notes: '' }) }],
    }) // adGroups
    .mockResolvedValueOnce({ empty: true, docs: [] }) // recipes
    .mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'a1',
          data: () => ({
            filename: 'ad1.png',
            status: 'approved',
            url: 'http://example.com/ad1.png',
          }),
        },
      ],
    }) // assets
    .mockResolvedValueOnce({ empty: true, docs: [] }) // groupAssets
    .mockResolvedValueOnce({ empty: true, docs: [] }); // requests
});

afterEach(() => {
  jest.clearAllMocks();
});

test('shows asset menu when menu button is clicked', async () => {
  render(
    <MemoryRouter>
      <ProjectDetail />
    </MemoryRouter>
  );

  const btn = await screen.findByLabelText('Ad options');
  fireEvent.click(btn);

  expect(await screen.findByText('Make Revisions')).toBeInTheDocument();
});

