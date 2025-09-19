import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Review from './Review';

jest.mock('./firebase/config', () => ({ db: {} }));
jest.mock('./useAgencyTheme', () => () => ({ agency: {} }));
jest.mock('./CopyRecipePreview.jsx', () => () => null);
jest.mock('./RecipePreview.jsx', () => () => <div />);
jest.mock('./utils/debugLog', () => jest.fn());
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockAddDoc = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockArrayUnion = jest.fn((val) => val);
const mockIncrement = jest.fn((val) => val);
const mockOnSnapshot = jest.fn(() => jest.fn());
const mockSetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  collectionGroup: jest.fn((...args) => args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  getDoc: (...args) => mockGetDoc(...args),
  addDoc: (...args) => mockAddDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: jest.fn(),
  doc: (...args) => mockDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  arrayUnion: (...args) => mockArrayUnion(...args),
  increment: (...args) => mockIncrement(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('loads ads from subcollections', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    if (col[1] === 'recipes')
      return Promise.resolve({ docs: [{ id: 'r1', data: () => ({ type: 'T1', components: {} }) }] });
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );
});

test('Review Ads button disabled until ads load', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  const btn = screen.getByRole('button', { name: /Review Ads/i });
  expect(btn).toBeDisabled();

  await waitFor(() => expect(btn).not.toBeDisabled());
});

test('submitResponse updates asset status', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockImplementation((ref) => {
    if (ref === 'adGroups/group1') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ name: 'Group 1', reviewVersion: 2, status: 'ready' }),
      });
    }
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  const statusSelect = await screen.findByLabelText('Status');
  fireEvent.change(statusSelect, { target: { value: 'approve' } });

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());

  expect(mockUpdateDoc).toHaveBeenCalledWith(
    'adGroups/group1/assets/asset1',
    expect.objectContaining({
      status: 'approved',
      comment: '',
      lastUpdatedBy: 'u1',
      isResolved: true,
    })
  );
});

test('submitResponse includes reviewer name', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(
    <Review user={{ uid: 'u1', email: 'e@test.com' }} reviewerName="Alice" brandCodes={['BR1']} />
  );

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());

  const respCall = mockAddDoc.mock.calls.find((c) => Array.isArray(c[0]) && c[0][3] === 'responses');
  expect(respCall[1]).toEqual(expect.objectContaining({ reviewerName: 'Alice' }));

  const update = mockUpdateDoc.mock.calls[0][1];
  expect(update.lastUpdatedBy).toBe('u1');
});

test('status change updates only the selected ad unit', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          filename: 'BR1_GX_RC1_9x16_V1.png',
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
      {
        id: 'asset2',
        data: () => ({
          filename: 'BR1_GY_RC1_1x1_V1.png',
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
    ],
  };

  mockGetDocs.mockImplementation(() => Promise.resolve({ docs: [] }));
  mockGetDocs.mockImplementationOnce(() => Promise.resolve(assetSnapshot));
  mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  const statusSelects = await screen.findAllByLabelText('Status');
  fireEvent.change(statusSelects[0], { target: { value: 'approve' } });

  await waitFor(() =>
    expect(
      mockUpdateDoc.mock.calls.some(
        ([path]) => typeof path === 'string' && path.includes('asset1'),
      ),
    ).toBe(true),
  );

  const assetPaths = mockUpdateDoc.mock.calls
    .map(([path]) => path)
    .filter((path) => typeof path === 'string' && path.includes('/assets/'));
  expect(assetPaths.some((p) => p.includes('asset2'))).toBe(false);
});

test('edit request applies to the correct ad unit', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          filename: 'BR1_GX_RC1_9x16_V1.png',
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
      {
        id: 'asset2',
        data: () => ({
          filename: 'BR1_GY_RC1_1x1_V1.png',
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
    ],
  };

  mockGetDocs.mockImplementation(() => Promise.resolve({ docs: [] }));
  mockGetDocs.mockImplementationOnce(() => Promise.resolve(assetSnapshot));
  mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  const statusSelects = await screen.findAllByLabelText('Status');
  fireEvent.change(statusSelects[0], { target: { value: 'edit' } });

  const commentBox = await screen.findByPlaceholderText('Add comments...');
  fireEvent.change(commentBox, { target: { value: 'Please tweak this asset' } });

  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  await waitFor(() =>
    expect(
      mockUpdateDoc.mock.calls.some(
        ([path, data]) =>
          typeof path === 'string' &&
          path.includes('asset1') &&
          data.status === 'edit_requested',
      ),
    ).toBe(true),
  );

  const assetPaths = mockUpdateDoc.mock.calls
    .map(([path]) => path)
    .filter((path) => typeof path === 'string' && path.includes('/assets/'));
  expect(assetPaths.some((p) => p.includes('asset2'))).toBe(false);
});

test('status updates only affect the matching ad unit when aspects differ', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          filename: 'BR1_GX_RC1_9x16_V1.png',
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
          adGroupId: 'group1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
      {
        id: 'asset2',
        data: () => ({
          filename: 'BR1_GX_RC1_1x1_V1.png',
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
          adGroupId: 'group1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
    ],
  };

  mockGetDocs.mockImplementation(() => Promise.resolve({ docs: [] }));
  mockGetDocs.mockImplementationOnce(() => Promise.resolve(assetSnapshot));
  mockGetDoc.mockImplementation((ref) => {
    if (ref === 'adGroups/group1') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ status: 'ready' }),
      });
    }
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  const statusSelects = await screen.findAllByLabelText('Status');
  fireEvent.change(statusSelects[0], { target: { value: 'approve' } });

  await waitFor(() =>
    expect(
      mockUpdateDoc.mock.calls.some(
        ([path]) => typeof path === 'string' && path.includes('asset1'),
      ),
    ).toBe(true),
  );

  const assetPaths = mockUpdateDoc.mock.calls
    .map(([path]) => path)
    .filter((path) => typeof path === 'string' && path.includes('/assets/'));
  expect(assetPaths.some((p) => p.includes('asset2'))).toBe(false);
});

test('edit request details stay with the selected ad unit when aspects differ', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          filename: 'BR1_GX_RC1_9x16_V1.png',
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
          adGroupId: 'group1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
      {
        id: 'asset2',
        data: () => ({
          filename: 'BR1_GX_RC1_1x1_V1.png',
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          recipeCode: 'RC1',
          brandCode: 'BR1',
          adGroupId: 'group1',
        }),
        ref: { parent: { parent: { id: '' } } },
      },
    ],
  };

  mockGetDocs.mockImplementation(() => Promise.resolve({ docs: [] }));
  mockGetDocs.mockImplementationOnce(() => Promise.resolve(assetSnapshot));
  mockGetDoc.mockImplementation((ref) => {
    if (ref === 'adGroups/group1') {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ status: 'ready' }),
      });
    }
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  const statusSelects = await screen.findAllByLabelText('Status');
  fireEvent.change(statusSelects[0], { target: { value: 'edit' } });

  const commentBox = await screen.findByPlaceholderText('Add comments...');
  fireEvent.change(commentBox, { target: { value: 'Adjust copy' } });

  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  await waitFor(() =>
    expect(
      mockUpdateDoc.mock.calls.some(
        ([path, data]) =>
          typeof path === 'string' &&
          path.includes('asset1') &&
          data.status === 'edit_requested' &&
          data.comment === 'Adjust copy',
      ),
    ).toBe(true),
  );

  const assetUpdates = mockUpdateDoc.mock.calls.filter(
    ([path]) => typeof path === 'string' && path.includes('/assets/'),
  );
  expect(assetUpdates.some(([path]) => path.includes('asset2'))).toBe(false);
});

test('request edit creates new version doc', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url2',
          filename: 'f1.png',
          version: 1,
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByLabelText('Request Edit'));
  fireEvent.change(screen.getByPlaceholderText('Add comments...'), {
    target: { value: 'fix' },
  });
  fireEvent.click(screen.getByText('Submit'));

  await waitFor(() => expect(mockAddDoc).toHaveBeenCalled());

  const call = mockAddDoc.mock.calls.find((c) => Array.isArray(c[0]) && c[0][1] === 'adGroups');
  expect(call).toBeTruthy();
  expect(call[1]).toEqual(
    expect.objectContaining({ parentAdId: 'asset1', version: 2, status: 'pending', isResolved: false })
  );
});

test('revision inherits root parentId when requesting another edit', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'rev2',
        data: () => ({
          firebaseUrl: 'url2',
          filename: 'f1.png',
          version: 2,
          parentAdId: 'asset1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'url2'));

  fireEvent.click(screen.getByLabelText('Request Edit'));
  fireEvent.change(screen.getByPlaceholderText('Add comments...'), {
    target: { value: 'fix' },
  });
  fireEvent.click(screen.getByText('Submit'));

  await waitFor(() => expect(mockAddDoc).toHaveBeenCalled());

  const call = mockAddDoc.mock.calls.find((c) => Array.isArray(c[0]) && c[0][1] === 'adGroups');
  expect(call).toBeTruthy();
  expect(call[1]).toEqual(
    expect.objectContaining({ parentAdId: 'asset1', version: 3, status: 'pending', isResolved: false })
  );
});

test('request edit advances to next ad', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'asset2',
        data: () => ({
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByLabelText('Request Edit'));
  fireEvent.change(screen.getByPlaceholderText('Add comments...'), {
    target: { value: 'fix' },
  });
  fireEvent.click(screen.getByText('Submit'));

  await waitFor(() => expect(mockAddDoc).toHaveBeenCalled());

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );
});

test('approving a revision resolves all related docs', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'rev1',
        data: () => ({
          firebaseUrl: 'rev.png',
          parentAdId: 'orig1',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };
  const relatedSnapshot = {
    docs: [
      { id: 'rev1', data: () => ({}) },
      { id: 'rev2', data: () => ({}) },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets')
      return Promise.resolve(relatedSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'rev.png'));

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());

  const paths = mockUpdateDoc.mock.calls.map((c) => c[0]);
  expect(paths).toContain('adGroups/group1/assets/rev2');
  expect(paths).toContain('adGroups/group1/assets/orig1');
});

test('approving a revision does not change archived versions', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'orig1',
        data: () => ({
          firebaseUrl: 'v1.png',
          version: 1,
          status: 'archived',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'rev2',
        data: () => ({
          firebaseUrl: 'v2.png',
          version: 2,
          parentAdId: 'orig1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  const relatedSnapshot = { docs: [] };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets')
      return Promise.resolve(relatedSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png'));

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());

  const call = mockUpdateDoc.mock.calls.find((c) => c[0] === 'adGroups/group1/assets/orig1');
  expect(call[1].status).toBeUndefined();
});

test('version selector changes revisions', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'orig',
        data: () => ({
          firebaseUrl: 'v1.png',
          version: 1,
          status: 'approved',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'rev2',
        data: () => ({
          firebaseUrl: 'v2.png',
          version: 2,
          parentAdId: 'orig',
          status: 'approved',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'rev3',
        data: () => ({
          firebaseUrl: 'v3.png',
          version: 3,
          parentAdId: 'orig',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v3.png')
  );

  fireEvent.click(screen.getByText('V3'));
  fireEvent.click(screen.getByRole('button', { name: 'V2' }));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png')
  );

  fireEvent.click(screen.getByText('V2'));
  fireEvent.click(screen.getByRole('button', { name: 'V1' }));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v1.png')
  );

  fireEvent.click(screen.getByText('V1'));
  fireEvent.click(screen.getByRole('button', { name: 'V3' }));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v3.png')
  );
});

test('two-version toggle cycles correctly', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'orig',
        data: () => ({
          firebaseUrl: 'v1.png',
          version: 1,
          status: 'approved',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'rev2',
        data: () => ({
          firebaseUrl: 'v2.png',
          version: 2,
          parentAdId: 'orig',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png')
  );

  fireEvent.click(screen.getByText('V2'));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v1.png')
  );

  fireEvent.click(screen.getByText('V1'));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png')
  );
});

test('fetches previous versions when only latest is loaded', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'rev2',
        data: () => ({
          firebaseUrl: 'v2.png',
          version: 2,
          parentAdId: 'orig',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };
  const parentSnap = {
    exists: () => true,
    data: () => ({
      firebaseUrl: 'v1.png',
      version: 1,
      status: 'approved',
      adGroupId: 'group1',
      brandCode: 'BR1',
    }),
  };

  mockGetDocs.mockResolvedValueOnce(assetSnapshot);
  mockGetDocs.mockResolvedValueOnce({ docs: [] });
  mockGetDoc.mockResolvedValue(parentSnap);

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png')
  );
  await waitFor(() => expect(screen.getByText('V2')).toBeInTheDocument());

  fireEvent.click(screen.getByText('V2'));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v1.png')
  );
  await waitFor(() => expect(screen.getByText('V1')).toBeInTheDocument());
});

test('shows badge for single higher version without older versions', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'rev2',
        data: () => ({
          firebaseUrl: 'v2.png',
          version: 2,
          parentAdId: 'orig',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockResolvedValueOnce(assetSnapshot);
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockGetDoc.mockResolvedValue({ exists: () => false });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png')
  );

  const badge = screen.getByText('V2');
  expect(badge).toBeInTheDocument();
  expect(badge).not.toHaveClass('cursor-pointer');

  fireEvent.click(badge);
  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2.png')
  );
});

test('ad unit shows only latest version and toggles', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'orig9',
        data: () => ({
          filename: 'BR1_G1_RC_9x16_V1.png',
          firebaseUrl: 'v1-9x16.png',
          version: 1,
          status: 'approved',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'orig1',
        data: () => ({
          filename: 'BR1_G1_RC_1x1_V1.png',
          firebaseUrl: 'v1-1x1.png',
          version: 1,
          status: 'approved',
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'rev1',
        data: () => ({
          filename: 'BR1_G1_RC_1x1_V2.png',
          firebaseUrl: 'v2-1x1.png',
          version: 2,
          parentAdId: 'orig1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v2-1x1.png')
  );
  expect(screen.getAllByRole('img').length).toBe(1);

  fireEvent.click(screen.getByText('V2'));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'v1-1x1.png')
  );
});

test('shows group summary after reviewing ads', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'asset2',
        data: () => ({
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);

  await waitFor(() => {
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

test('filters ads by last login and still shows summary', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'old',
          lastUpdatedAt: { toDate: () => new Date('2024-01-01T00:00:00Z') },
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'asset2',
        data: () => ({
          firebaseUrl: 'new',
          lastUpdatedAt: { toDate: () => new Date('2024-03-01T00:00:00Z') },
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(
    <Review
      user={{ uid: 'u1', metadata: { lastSignInTime: '2024-02-01T00:00:00Z' } }}
      brandCodes={['BR1']}
    />
  );

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'new')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);
  await waitFor(() => screen.getByText('Your ads are ready!'));
  expect(screen.getByText('Your ads are ready!')).toBeInTheDocument();
});

test('resolved ads are excluded from pending review', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'asset2',
        data: () => ({
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: true,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets')
      return Promise.resolve({ docs: assetSnapshot.docs.filter((d) => !d.data().isResolved) });
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);
  await waitFor(() => screen.getByText('Your ads are ready!'));
});

test('shows all ads for group review when none new', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', brandCode: 'BR1' }),
  };
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'url1', status: 'approved' }) },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(
    <Review
      user={{ uid: 'u1', metadata: { lastSignInTime: '2024-05-01T00:00:00Z' } }}
      groupId="group1"
    />
  );

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  expect(screen.getByText('Reject')).toHaveClass('opacity-50');
});

test('pending ads are hidden from group review', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', brandCode: 'BR1' }),
  };
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'url1', status: 'ready' }) },
      { id: 'asset2', data: () => ({ firebaseUrl: 'url2', status: 'pending' }) },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);
  await waitFor(() => screen.getByText('Your ads are ready!'));
});

test('shows pending message when only pending ads', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', brandCode: 'BR1' }),
  };
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'url1', status: 'pending' }) },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  expect(await screen.findByText('Ads Pending Review')).toBeInTheDocument();
});

test('submitResponse records last viewed time for group', async () => {
  const original = window.localStorage.setItem;
  const setItem = jest.fn();
  window.localStorage.setItem = setItem;

  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', brandCode: 'BR1' }),
  };
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'url1', status: 'ready', isResolved: false }) },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);
  await waitFor(() => {
    const call = setItem.mock.calls.find(
      (c) => c[0] === 'lastViewed-group1'
    );
    expect(call).toBeTruthy();
  });

  window.localStorage.setItem = original;
});

test('shows final status without change option', async () => {

  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', brandCode: 'BR1' }),
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'approved',
          comment: 'note',
        }),
      },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  await waitFor(() => screen.getByText('Approved'));

  expect(screen.queryByText('Change')).not.toBeInTheDocument();
  expect(screen.queryByText('Approve')).not.toBeInTheDocument();

  expect(screen.getByLabelText('Next')).toBeInTheDocument();
});


test('progress bar reflects current index', async () => {
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'url1', status: 'ready', isResolved: false, adGroupId: 'group1', brandCode: 'BR1' }) },
      { id: 'asset2', data: () => ({ firebaseUrl: 'url2', status: 'ready', isResolved: false, adGroupId: 'group1', brandCode: 'BR1' }) },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'url1'));

  const bar = screen.getByRole('progressbar').firstChild;
  expect(bar).toHaveStyle('width: 0%');

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);

  await waitFor(() => expect(bar).toHaveStyle('width: 50%'));
});

test('ad container is not remounted when currentIndex changes', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
      {
        id: 'asset2',
        data: () => ({
          firebaseUrl: 'url2',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'url1'));

  const initialContainer = screen.getByAltText('Ad').parentElement;

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(initialContainer);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'url2'));

  const newContainer = screen.getByAltText('Ad').parentElement;
  expect(newContainer).toBe(initialContainer);
});

test('shows alert when locking fails due to permissions', async () => {
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
    ],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1', status: 'pending' }) });

  const err = new Error('nope');
  err.code = 'permission-denied';
  mockUpdateDoc.mockRejectedValue(err);

  window.alert = jest.fn();

  render(
    <Review
      user={{ uid: 'u1' }}
      reviewerName="Alice"
      groupId="group1"
      brandCodes={['BR1']}
    />
  );

  await waitFor(() => expect(window.alert).toHaveBeenCalled());
  expect(window.alert.mock.calls[0][0]).toMatch(/unable to acquire lock/i);
  await waitFor(() =>
    expect(screen.getByText(/Unable to acquire lock for this group/i)).toBeInTheDocument()
  );
});

test('opening and exiting completed group keeps status', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', brandCode: 'BR1', status: 'done' }),
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'approved',
          isResolved: true,
        }),
      },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  const { unmount } = render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  await screen.findByText('Approved');

  fireEvent.click(screen.getByText('Review Ads'));
  await screen.findByRole('img');

  unmount();

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());

  const call = mockUpdateDoc.mock.calls.find((c) => c[0] === 'adGroups/group1');
  expect(call[1]).toEqual({ status: 'done', reviewProgress: null });
  expect(
    mockUpdateDoc.mock.calls.some((c) => c[1].status === 'in review')
  ).toBe(false);
});

test('returns to start screen after finishing review', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', status: 'pending' }),
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
        }),
      },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  fireEvent.click(screen.getByText('Review Ads'));
  await screen.findByRole('img');
  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);

  await screen.findByText(/Your ads are ready/i);
});

test('updates group status after finishing review', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', status: 'pending' }),
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
        }),
      },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  fireEvent.click(screen.getByText('Review Ads'));
  await screen.findByRole('img');
  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());

  const call = mockUpdateDoc.mock.calls.find((c) => c[0] === 'adGroups/group1');
  expect(call[1]).toEqual({ status: 'done', reviewProgress: null });
});

test('updates status and shows summary when no ads available', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', status: 'pending' }),
  };
  const assetSnapshot = { docs: [] };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
  const call = mockUpdateDoc.mock.calls.find((c) => c[0] === 'adGroups/group1');
  expect(call[1]).toEqual({ status: 'done', reviewProgress: null });

  expect(await screen.findByText(/Your ads are ready/i)).toBeInTheDocument();
});

test('client approval updates group status', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', status: 'ready' }),
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'ready',
          isResolved: false,
          adGroupId: 'group1',
        }),
      },
    ],
  };

  mockGetDoc.mockResolvedValue(groupDoc);
  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      return Promise.resolve(assetSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'c1' }} userRole="client" groupId="group1" />);

  fireEvent.click(screen.getByText('Review Ads'));
  await screen.findByRole('img');
  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
  const call = mockUpdateDoc.mock.calls.find((c) => c[0] === 'adGroups/group1');
  expect(call[1]).toEqual(expect.objectContaining({ status: 'done' }));
});

test('brief review collects feedback', async () => {
  const assetSnapshot = {
    docs: [],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    if (col[1] === 'recipes')
      return Promise.resolve({ docs: [{ id: 'r1', data: () => ({ type: 'T1', components: {} }) }] });
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1', reviewVersion: 3 }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} groupId="group1" />);

  await screen.findByText('Your brief is ready!');
  const briefBtn = screen.getByText('See Brief');
  expect(briefBtn).toBeEnabled();
  expect(screen.queryByText('Ad Gallery')).not.toBeInTheDocument();
  fireEvent.click(briefBtn);
  const fbBtn = screen.getByLabelText('leave overall feedback');
  fireEvent.click(fbBtn);
  const textarea = await screen.findByPlaceholderText('leave overall feedback...');
  fireEvent.change(textarea, { target: { value: 'Looks good' } });
  fireEvent.click(screen.getByText('Submit'));
  await waitFor(() => expect(mockAddDoc).toHaveBeenCalled());
});

test('brief review displays when no recipes', async () => {
  const assetSnapshot = {
    docs: [],
  };

  mockGetDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    if (col[1] === 'recipes') return Promise.resolve({ docs: [] });
    return Promise.resolve({ docs: [] });
  });
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ name: 'Group 1', reviewVersion: 3 }),
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} groupId="group1" />);

  await screen.findByText('Your brief is ready!');
  const briefBtn = screen.getByText('See Brief');
  expect(briefBtn).toBeEnabled();
});

