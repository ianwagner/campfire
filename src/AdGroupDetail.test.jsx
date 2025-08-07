import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));

const mockUseUserRole = jest.fn(() => ({ role: 'admin', brandCodes: [], loading: false }));
jest.mock('./useUserRole', () => (...args) => mockUseUserRole(...args));

jest.mock('./RecipePreview.jsx', () => () => <div />);
jest.mock('./CopyRecipePreview.jsx', () => () => <div />);
jest.mock('./BrandAssets.jsx', () => () => <div />);
jest.mock('./BrandAssetsLayout.jsx', () => () => <div />);
jest.mock('./components/HoverPreview.jsx', () => () => <div />);
jest.mock('./components/ShareLinkModal.jsx', () => () => <div />);
jest.mock('./components/OptimizedImage.jsx', () => () => <div />);
jest.mock('./components/VideoPlayer.jsx', () => () => <div />);
jest.mock('./LoadingOverlay', () => () => <div />);
jest.mock('./components/Modal.jsx', () => ({ children }) => <div>{children}</div>);

const mockGetDoc = jest.fn();
const mockOnSnapshot = jest.fn();
const mockUpdateDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockCollection = jest.fn((...args) => args);
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);
const mockArrayUnion = jest.fn((...args) => args);
const mockDeleteField = jest.fn(() => 'DELETE_FIELD');

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  collection: (...args) => mockCollection(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  arrayUnion: (...args) => mockArrayUnion(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  deleteField: (...args) => mockDeleteField(...args),
}));

jest.mock('firebase/storage', () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock('./uploadFile', () => ({ uploadFile: jest.fn() }));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'group1' }),
}));

beforeEach(() => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    id: 'group1',
    data: () => ({ name: 'Group 1', brandCode: 'BR1', status: 'draft' }),
  });
  mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('toggles asset status to ready', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'f1.png', status: 'pending' }) }] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('f1.png');
  const select = screen.getByRole('combobox');
  fireEvent.change(select, { target: { value: 'ready' } });

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
  expect(mockUpdateDoc).toHaveBeenCalledWith('adGroups/group1/assets/asset1', { status: 'ready' });
});

test('toggles asset status back to pending', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'f1.png', status: 'ready' }) }] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('f1.png');
  const select = screen.getByRole('combobox');
  fireEvent.change(select, { target: { value: 'pending' } });

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
  expect(mockUpdateDoc).toHaveBeenCalledWith('adGroups/group1/assets/asset1', { status: 'pending' });
});

test('fetches recipe history', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        { id: 'asset1', data: () => ({ filename: '1_9x16.png', status: 'ready' }) },
        { id: 'asset2', data: () => ({ filename: '1_3x5.png', status: 'ready' }) },
      ],
    });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('1_9x16.png');
  const historyBtn = screen.getByLabelText('History');
  fireEvent.click(historyBtn);

  await waitFor(() => expect(mockGetDocs).toHaveBeenCalled());
  expect(mockCollection).toHaveBeenCalledWith(
    {},
    'adGroups',
    'group1',
    'assets',
    'asset1',
    'history'
  );
});

test('opens metadata modal for recipe id "1"', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    const path = Array.isArray(col) ? col.join('/') : '';
    if (path.includes('recipes')) {
      cb({
        docs: [
          {
            id: '1',
            data: () => ({ metadata: {}, copy: 'hello', components: {} }),
          },
        ],
      });
    } else {
      cb({ docs: [{ id: 'asset1', data: () => ({ filename: '1_9x16.png', status: 'ready' }) }] });
    }
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('1_9x16.png');
  const metadataBtn = screen.getByLabelText('Metadata');
  fireEvent.click(metadataBtn);

  await screen.findByText('Metadata for Recipe 1');
  expect(screen.getByLabelText('Copy')).toBeInTheDocument();
});

test('updates version display when asset changes', async () => {
  let snapshotCb;
  mockOnSnapshot.mockImplementation((col, cb) => {
    snapshotCb = cb;
    cb({
      docs: [
        {
          id: 'asset1',
          data: () => ({ filename: 'ad_V1.png', version: 1, status: 'pending' }),
        },
      ],
    });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>,
  );

  let row = await screen.findByText('ad_V1.png');
  let versionCell = row.closest('tr').querySelector('td:nth-child(2)');
  expect(versionCell).toHaveTextContent('1');

  await act(async () => {
    snapshotCb({
      docs: [
        {
          id: 'asset1',
          data: () => ({ filename: 'ad_V2.png', version: 2, status: 'pending' }),
        },
      ],
    });
  });

  row = await screen.findByText('ad_V2.png');
  versionCell = row.closest('tr').querySelector('td:nth-child(2)');
  expect(versionCell).toHaveTextContent('2');
});

test('admin can manage month even without agency', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [] });
    return jest.fn();
  });

  const { container } = render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByText('Group 1');
  const monthInput = container.querySelector('input[type="month"]');
  expect(monthInput).toBeInTheDocument();

  fireEvent.change(monthInput, { target: { value: '2024-07' } });
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(1, 'adGroups/group1', { month: '2024-07' })
  );

  fireEvent.change(monthInput, { target: { value: '2024-08' } });
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(2, 'adGroups/group1', { month: '2024-08' })
  );

  fireEvent.change(monthInput, { target: { value: '' } });
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(3, 'adGroups/group1', { month: 'DELETE_FIELD' })
  );
});
