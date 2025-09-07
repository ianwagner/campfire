import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AdGroupDetail from './AdGroupDetail';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));

const mockUseUserRole = jest.fn(() => ({ role: 'admin', brandCodes: [], loading: false }));
jest.mock('./useUserRole', () => (...args) => mockUseUserRole(...args));

jest.mock('./RecipePreview.jsx', () => ({ onSave }) => (
  <button data-testid="recipe-preview" onClick={() => onSave([{ id: '1', copy: 'hello', components: {} }])}>
    save recipe
  </button>
));
jest.mock('./CopyRecipePreview.jsx', () => () => <div />);
jest.mock('./BrandAssets.jsx', () => () => <div />);
jest.mock('./BrandAssetsLayout.jsx', () => () => <div />);

const mockGetDoc = jest.fn();
const mockOnSnapshot = jest.fn();
const mockUpdateDoc = jest.fn(() => Promise.resolve());
const mockSetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockAddDoc = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockCollection = jest.fn((...args) => args);
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);
const mockArrayUnion = jest.fn((...args) => args);
var mockBatchSet;
var mockBatchDelete;
var mockBatchCommit;
var mockWriteBatch;

jest.mock('firebase/firestore', () => {
  mockBatchSet = jest.fn();
  mockBatchDelete = jest.fn();
  mockBatchCommit = jest.fn();
  mockWriteBatch = jest.fn(() => ({
    update: jest.fn(),
    set: mockBatchSet,
    delete: mockBatchDelete,
    commit: mockBatchCommit,
  }));
  return {
    doc: (...args) => mockDoc(...args),
    getDoc: (...args) => mockGetDoc(...args),
    onSnapshot: (...args) => mockOnSnapshot(...args),
    collection: (...args) => mockCollection(...args),
    updateDoc: (...args) => mockUpdateDoc(...args),
    setDoc: (...args) => mockSetDoc(...args),
    serverTimestamp: jest.fn(),
    writeBatch: mockWriteBatch,
    addDoc: (...args) => mockAddDoc(...args),
    deleteDoc: jest.fn(),
    arrayUnion: (...args) => mockArrayUnion(...args),
    getDocs: (...args) => mockGetDocs(...args),
    query: (...args) => mockQuery(...args),
    where: (...args) => mockWhere(...args),
  };
});

jest.mock('firebase/storage', () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock('./uploadFile', () => ({ uploadFile: jest.fn() }));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'group1' }),
}));

beforeEach(() => {
  mockGetDoc.mockImplementation((path) => {
    if (path === 'adGroups/group1') {
      return Promise.resolve({
        exists: () => true,
        id: 'group1',
        data: () => ({
          name: 'Group 1',
          brandCode: 'BR1',
          status: 'draft',
          agencyId: null,
        }),
      });
    }
    if (path === 'brands/BR1') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ agencyId: 'agency1', recipeTypes: [] }),
      });
    }
    return Promise.resolve({ exists: () => false });
  });
  mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
  mockUseUserRole.mockReturnValue({ role: 'admin', brandCodes: [], loading: false });
});

afterEach(() => {
  jest.clearAllMocks();
  mockUseUserRole.mockReturnValue({ role: 'admin', brandCodes: [], loading: false });
});

test('editor can open recipe modal and save recipes', async () => {
  mockUseUserRole.mockReturnValue({ role: 'editor', brandCodes: [], loading: false });
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  const briefTab = await screen.findByRole('button', { name: 'Brief' });
  fireEvent.click(briefTab);

  const briefsTextNodes = await screen.findAllByText((content) => content.trim() === 'Briefs');
  const briefsBtn = briefsTextNodes.find((el) => el.closest('button'))?.closest('button');
  expect(briefsBtn).toBeTruthy();
  fireEvent.click(briefsBtn);

  const saveBtn = await screen.findByTestId('recipe-preview');
  fireEvent.click(saveBtn);

  await waitFor(() => expect(mockBatchCommit).toHaveBeenCalled());
  expect(screen.queryByTestId('recipe-preview')).not.toBeInTheDocument();
});

test('project manager can open recipe modal and save recipes', async () => {
  mockUseUserRole.mockReturnValue({ role: 'project-manager', brandCodes: [], loading: false });
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [] });
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  const briefTab = await screen.findByRole('button', { name: 'Brief' });
  fireEvent.click(briefTab);

  const briefsTextNodes = await screen.findAllByText((content) => content.trim() === 'Briefs');
  const briefsBtn = briefsTextNodes.find((el) => el.closest('button'))?.closest('button');
  expect(briefsBtn).toBeTruthy();
  fireEvent.click(briefsBtn);

  const saveBtn = await screen.findByTestId('recipe-preview');
  fireEvent.click(saveBtn);

  await waitFor(() => expect(mockBatchCommit).toHaveBeenCalled());
  expect(screen.queryByTestId('recipe-preview')).not.toBeInTheDocument();
});

test('editor can open gallery modal', async () => {
  mockUseUserRole.mockReturnValue({ role: 'editor', brandCodes: [], loading: false });
  mockOnSnapshot.mockImplementation((col, cb) => {
    const last = col[col.length - 1];
    if (last === 'assets') {
      cb({ docs: [{ id: 'a1', data: () => ({ filename: 'ad1.png', firebaseUrl: 'https://example.com/ad1.png', status: 'ready' }) }] });
    } else {
      cb({ docs: [] });
    }
    return jest.fn();
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  const galleryBtn = await screen.findByLabelText('See Gallery');
  fireEvent.click(galleryBtn);
  expect(await screen.findByText('Ad Gallery')).toBeInTheDocument();
});

test('admin can send ad group to client projects', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [] });
    return jest.fn();
  });
  mockAddDoc.mockResolvedValue({ id: 'proj1' });
  mockGetDocs.mockImplementation((q) => {
    if (Array.isArray(q) && Array.isArray(q[0]) && q[0][1] === 'users') {
      return Promise.resolve({
        empty: false,
        docs: [{ id: 'client1', data: () => ({ fullName: 'Client 1' }) }],
      });
    }
    return Promise.resolve({ empty: true, docs: [] });
  });
  window.alert = jest.fn();

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  const sendBtn = await screen.findByLabelText('Send to Projects');
  fireEvent.click(sendBtn);
  const clientBtn = await screen.findByRole('button', { name: 'Client 1' });
  fireEvent.click(clientBtn);

  await waitFor(() => expect(mockAddDoc).toHaveBeenCalled());
  expect(mockAddDoc.mock.calls[0][1]).toMatchObject({
    userId: 'client1',
    groupId: 'group1',
    agencyId: 'agency1',
  });
  expect(mockUpdateDoc).toHaveBeenCalledWith(
    'adGroups/group1',
    expect.objectContaining({
      projectId: 'proj1',
      uploadedBy: 'client1',
      agencyId: 'agency1',
    }),
  );
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith(
      'Ad group added to client projects',
    ),
  );
  await waitFor(() =>
    expect(screen.queryByText('Select Client')).not.toBeInTheDocument(),
  );
});

test('shows error when sending to projects fails and keeps modal open', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({ docs: [] });
    return jest.fn();
  });
  mockAddDoc.mockRejectedValue(new Error('server down'));
  mockGetDocs.mockImplementation((q) => {
    if (Array.isArray(q) && Array.isArray(q[0]) && q[0][1] === 'users') {
      return Promise.resolve({
        empty: false,
        docs: [{ id: 'client1', data: () => ({ fullName: 'Client 1' }) }],
      });
    }
    return Promise.resolve({ empty: true, docs: [] });
  });
  window.alert = jest.fn();

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>,
  );

  const sendBtn = await screen.findByLabelText('Send to Projects');
  fireEvent.click(sendBtn);
  const clientBtn = await screen.findByRole('button', { name: 'Client 1' });
  fireEvent.click(clientBtn);

  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith(
      'Failed to add group to projects: server down',
    ),
  );
  expect(mockUpdateDoc).not.toHaveBeenCalled();
  expect(screen.getByText('Select Client')).toBeInTheDocument();
});

test('allows changing review type when assets exist', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    if (Array.isArray(col) && col.includes('assets')) {
      cb({ docs: [{ id: 'asset1', data: () => ({ filename: 'ad1.png', status: 'ready' }) }] });
    } else {
      cb({ docs: [] });
    }
    return jest.fn();
  });
  mockGetDoc.mockImplementation((path) => {
    if (path === 'adGroups/group1') {
      return Promise.resolve({
        exists: () => true,
        id: 'group1',
        data: () => ({
          name: 'Group 1',
          brandCode: 'BR1',
          status: 'draft',
          agencyId: null,
          reviewVersion: 1,
        }),
      });
    }
    if (path === 'brands/BR1') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ agencyId: 'agency1', recipeTypes: [] }),
      });
    }
    return Promise.resolve({ exists: () => false });
  });

  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );

  const select = await screen.findByLabelText('Review Type');
  expect(select).toBeInTheDocument();
  expect(select.value).toBe('1');

  fireEvent.change(select, { target: { value: '2' } });

  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenCalledWith('adGroups/group1', {
      reviewVersion: 2,
    }),
  );
  await waitFor(() => expect(screen.getByLabelText('Review Type').value).toBe('2'));
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
  mockGetDocs.mockImplementation((colRef) => {
    if (Array.isArray(colRef) && colRef.includes('history')) {
      const docs = [{ id: 'h1' }, { id: 'h2' }];
      return Promise.resolve({
        docs,
        forEach: (cb) => docs.forEach((d) => cb(d)),
      });
    }
    return Promise.resolve({ empty: true, docs: [], forEach: () => {} });
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
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset1/history/h1');
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset1/history/h2');
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset2/history/h1');
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset2/history/h2');
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset3/history/h1');
    expect(batch.delete).toHaveBeenCalledWith('adGroups/group1/assets/asset3/history/h2');
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
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'adGroups/group1',
      expect.objectContaining({ status: 'ready' })
    )
  );
  confirmSpy.mockRestore();
});

test('scrubbing pending or edit requested ads sets status to ready and keeps archived ads archived', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        {
          id: 'asset1',
          data: () => ({ filename: 'ad_V1.png', version: 1, status: 'pending' }),
        },
        {
          id: 'asset2',
          data: () => ({ filename: 'ad_V2.png', version: 2, parentAdId: 'asset1', status: 'edit_requested' }),
        },
        {
          id: 'asset3',
          data: () => ({ filename: 'ad3.png', version: 1, status: 'rejected' }),
        },
        {
          id: 'asset4',
          data: () => ({ filename: 'ad4.png', version: 1, status: 'archived' }),
        },
      ],
    });
    return jest.fn();
  });
  mockGetDocs.mockImplementation((colRef) => {
    if (Array.isArray(colRef) && colRef.includes('history')) {
      const docs = [{ id: 'h1' }];
      return Promise.resolve({
        docs,
        forEach: (cb) => docs.forEach((d) => cb(d)),
      });
    }
    return Promise.resolve({ empty: true, docs: [], forEach: () => {} });
  });
  const confirmSpy = jest
    .spyOn(window, 'confirm')
    .mockReturnValue(true);
  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>,
  );

  await screen.findByLabelText('Scrub Review History');
  fireEvent.click(screen.getByLabelText('Scrub Review History'));

  expect(confirmSpy).toHaveBeenCalledWith(
    'One or more ads are pending or have an active edit request. Would you still like to scrub them?'
  );

  await waitFor(() => {
    const batch = require('firebase/firestore').writeBatch.mock.results[0].value;
    expect(batch.update).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset2',
      expect.objectContaining({ status: 'ready' })
    );
    expect(batch.update).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset3',
      expect.objectContaining({ status: 'archived' })
    );
    expect(batch.update).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset4',
      expect.objectContaining({ status: 'archived' })
    );
  });
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'adGroups/group1',
      expect.objectContaining({ status: 'ready' })
    )
  );
  confirmSpy.mockRestore();
});

test('scrubbing sets group status to done when all ads archived', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        {
          id: 'asset1',
          data: () => ({ filename: 'ad1.png', version: 1, status: 'rejected' }),
        },
        {
          id: 'asset2',
          data: () => ({ filename: 'ad2.png', version: 1, status: 'archived' }),
        },
      ],
    });
    return jest.fn();
  });
  mockGetDocs.mockResolvedValue({
    docs: [],
    forEach: () => {},
  });
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>
  );
  await screen.findByLabelText('Scrub Review History');
  fireEvent.click(screen.getByLabelText('Scrub Review History'));
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'adGroups/group1',
      expect.objectContaining({ status: 'done' })
    )
  );
  confirmSpy.mockRestore();
});

test('undo scrub restores review history', async () => {
  mockOnSnapshot.mockImplementation((col, cb) => {
    cb({
      docs: [
        {
          id: 'asset2',
          data: () => ({ filename: 'ad.png', version: 1, status: 'ready', scrubbedFrom: 'asset1' }),
        },
      ],
    });
    return jest.fn();
  });
  mockGetDocs.mockImplementation((ref) => {
    if (Array.isArray(ref) && ref.includes('scrubbedHistory') && !ref.includes('assets')) {
      return Promise.resolve({ docs: [{ id: 'asset1' }] });
    }
    if (Array.isArray(ref) && ref.includes('scrubbedHistory') && ref.includes('assets')) {
      const docs = [
        {
          id: 'asset1',
          data: () => ({ filename: 'ad_V1.png', version: 1, status: 'approved' }),
        },
      ];
      return Promise.resolve({
        docs,
        forEach: (cb) => docs.forEach((d) => cb(d)),
      });
    }
    return Promise.resolve({ empty: true, docs: [], forEach: () => {} });
  });
  render(
    <MemoryRouter>
      <AdGroupDetail />
    </MemoryRouter>,
  );
  await screen.findByLabelText('Undo Scrub');
  fireEvent.click(screen.getByLabelText('Undo Scrub'));
  await waitFor(() => {
    const batch = require('firebase/firestore').writeBatch.mock.results[0].value;
    expect(batch.set).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset1',
      expect.objectContaining({ version: 1 }),
    );
    expect(batch.delete).toHaveBeenCalledWith(
      'adGroups/group1/scrubbedHistory/asset1/assets/asset1',
    );
    expect(batch.update).toHaveBeenCalledWith(
      'adGroups/group1/assets/asset2',
      expect.objectContaining({ version: 2, parentAdId: 'asset1' }),
    );
  });
  await waitFor(() =>
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'adGroups/group1',
      expect.objectContaining({ status: 'ready' }),
    ),
  );
});
