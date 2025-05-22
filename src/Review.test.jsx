import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Review from './Review';

jest.mock('./firebase/config', () => ({ db: {} }));

const getDocs = jest.fn();
const getDoc = jest.fn();
const updateDoc = jest.fn();
const addDoc = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const arrayUnion = jest.fn((val) => val);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  getDocs: (...args) => getDocs(...args),
  getDoc: (...args) => getDoc(...args),
  addDoc: (...args) => addDoc(...args),
  serverTimestamp: jest.fn(),
  doc: (...args) => docMock(...args),
  updateDoc: (...args) => updateDoc(...args),
  arrayUnion: (...args) => arrayUnion(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('loads ads from subcollections', async () => {
  const batchSnapshot = {
    docs: [{ id: 'batch1', data: () => ({ brandCode: 'BR1' }) }],
  };
  const adsSnapshot = {
    docs: [{ id: 'ad1', data: () => ({ adUrl: 'url1' }) }],
  };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1' }) }],
  };
  const assetSnapshot = {
    docs: [{ id: 'asset1', data: () => ({ firebaseUrl: 'url2' }) }],
  };

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adBatches' && col.length === 2) return Promise.resolve(batchSnapshot);
    if (col[1] === 'adBatches' && col[col.length - 1] === 'ads') return Promise.resolve(adsSnapshot);
    if (col[1] === 'adGroups' && col.length === 2) return Promise.resolve(groupSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );
});

test('submitResponse updates asset status', async () => {
  const batchSnapshot = { docs: [] };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1', name: 'Group 1' }) }],
  };
  const assetSnapshot = {
    docs: [{ id: 'asset1', data: () => ({ firebaseUrl: 'url2' }) }],
  };

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adBatches' && col.length === 2) return Promise.resolve(batchSnapshot);
    if (col[1] === 'adGroups' && col.length === 2) return Promise.resolve(groupSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());

  expect(updateDoc).toHaveBeenCalledWith(
    'adGroups/group1/assets/asset1',
    expect.objectContaining({
      status: 'approved',
      comment: '',
      lastUpdatedBy: 'u1',
      isResolved: true,
    })
  );
});

test('request edit creates new version doc', async () => {
  const batchSnapshot = { docs: [] };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1', name: 'Group 1' }) }],
  };
  const assetSnapshot = {
    docs: [{ id: 'asset1', data: () => ({ firebaseUrl: 'url2', filename: 'f1.png', version: 1 }) }],
  };

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adBatches' && col.length === 2) return Promise.resolve(batchSnapshot);
    if (col[1] === 'adGroups' && col.length === 2) return Promise.resolve(groupSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByText('Request Edit'));
  fireEvent.change(screen.getByPlaceholderText('Add comments...'), {
    target: { value: 'fix' },
  });
  fireEvent.click(screen.getByText('Submit'));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());

  const call = addDoc.mock.calls.find((c) => Array.isArray(c[0]) && c[0][1] === 'adGroups');
  expect(call).toBeTruthy();
  expect(call[1]).toEqual(
    expect.objectContaining({ parentAdId: 'asset1', version: 2, status: 'pending', isResolved: false })
  );
});

test('approving a revision resolves all related docs', async () => {
  const batchSnapshot = { docs: [] };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1', name: 'Group 1' }) }],
  };
  const assetSnapshot = {
    docs: [{ id: 'rev1', data: () => ({ firebaseUrl: 'rev.png', parentAdId: 'orig1' }) }],
  };
  const relatedSnapshot = {
    docs: [
      { id: 'rev1', data: () => ({}) },
      { id: 'rev2', data: () => ({}) },
    ],
  };

  let callCount = 0;
  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adBatches' && col.length === 2) return Promise.resolve(batchSnapshot);
    if (col[1] === 'adGroups' && col.length === 2) return Promise.resolve(groupSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') {
      callCount++;
      return Promise.resolve(callCount === 1 ? assetSnapshot : relatedSnapshot);
    }
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'rev.png'));

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());

  const paths = updateDoc.mock.calls.map((c) => c[0]);
  expect(paths).toContain('adGroups/group1/assets/rev2');
  expect(paths).toContain('adGroups/group1/assets/orig1');
});

test('shows group summary after reviewing ads', async () => {
  const batchSnapshot = { docs: [] };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1', name: 'Group 1' }) }],
  };
  const assetSnapshot = {
    docs: [
      { id: 'asset1', data: () => ({ firebaseUrl: 'url1' }) },
      { id: 'asset2', data: () => ({ firebaseUrl: 'url2' }) },
    ],
  };

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adBatches' && col.length === 2) return Promise.resolve(batchSnapshot);
    if (col[1] === 'adGroups' && col.length === 2) return Promise.resolve(groupSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => screen.getByText('Thank you for your feedback!'));

  expect(screen.getByText('Group 1')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
});

test('filters ads by last login and still shows summary', async () => {
  const batchSnapshot = { docs: [] };
  const groupSnapshot = {
    docs: [{ id: 'group1', data: () => ({ brandCode: 'BR1', name: 'Group 1' }) }],
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'old',
          lastUpdatedAt: { toDate: () => new Date('2024-01-01T00:00:00Z') },
        }),
      },
      {
        id: 'asset2',
        data: () => ({
          firebaseUrl: 'new',
          lastUpdatedAt: { toDate: () => new Date('2024-03-01T00:00:00Z') },
        }),
      },
    ],
  };

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'adBatches' && col.length === 2) return Promise.resolve(batchSnapshot);
    if (col[1] === 'adGroups' && col.length === 2) return Promise.resolve(groupSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });

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

  await waitFor(() => screen.getByText('Thank you for your feedback!'));
  expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
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

  getDoc.mockResolvedValue(groupDoc);
  getDocs.mockImplementation((args) => {
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
