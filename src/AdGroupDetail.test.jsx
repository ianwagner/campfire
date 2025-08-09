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

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  collection: (...args) => mockCollection(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(() => ({
    update: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(),
  })),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  arrayUnion: (...args) => mockArrayUnion(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
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

test.skip('toggles asset status to ready', async () => {
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

test.skip('toggles asset status back to pending', async () => {
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

test.skip('fetches recipe history', async () => {
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

test.skip('opens metadata modal for recipe id "1"', async () => {
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

test.skip('updates version display when asset changes', async () => {
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

test('scrubs review history', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        {
          id: 'asset1',
          data: () => ({ filename: 'ad_V1.png', version: 1, status: 'approved' }),
        },
        {
          id: 'asset2',
          data: () => ({ filename: 'ad_V2.png', version: 2, parentAdId: 'asset1', status: 'approved' }),
        },
        {
          id: 'asset3',
          data: () => ({ filename: 'ad3.png', version: 1, status: 'rejected' }),
        },
      ],
    });
    return jest.fn();
  });
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  await screen.findByLabelText('Scrub Review History');
  fireEvent.click(screen.getByLabelText('Scrub Review History'));

  await waitFor(() => {
    const batch = require('firebase/firestore').writeBatch.mock.results[0].value;
    expect(batch.commit).toHaveBeenCalled();
    expect(batch.set).toHaveBeenCalledWith(
      'adGroups/group1/scrubbedHistory/asset1/assets/asset1',
      expect.objectContaining({ version: 1 })
    );
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset1');
    expect(batch.update).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset2',
      expect.objectContaining({
        version: 1,
        parentAdId: null,
        scrubbedFrom: 'asset1',
        status: 'ready',
      })
    );
    expect(batch.update).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset3',
      expect.objectContaining({ status: 'archived' })
    );
  });
  confirmSpy.mockRestore();
});
