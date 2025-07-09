import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Review from './Review';

jest.mock('./firebase/config', () => ({ db: {} }));
jest.mock('./useAgencyTheme', () => () => ({ agency: {} }));

const getDocs = jest.fn();
const getDoc = jest.fn();
const updateDoc = jest.fn();
const addDoc = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const arrayUnion = jest.fn((val) => val);
const increment = jest.fn((val) => val);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  collectionGroup: jest.fn((...args) => args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  getDocs: (...args) => getDocs(...args),
  getDoc: (...args) => getDoc(...args),
  addDoc: (...args) => addDoc(...args),
  serverTimestamp: jest.fn(),
  doc: (...args) => docMock(...args),
  updateDoc: (...args) => updateDoc(...args),
  arrayUnion: (...args) => arrayUnion(...args),
  increment: (...args) => increment(...args),
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(
    <Review user={{ uid: 'u1', email: 'e@test.com' }} reviewerName="Alice" brandCodes={['BR1']} />
  );

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());

  const respCall = addDoc.mock.calls.find((c) => Array.isArray(c[0]) && c[0][3] === 'responses');
  expect(respCall[1]).toEqual(expect.objectContaining({ reviewerName: 'Alice' }));

  const update = updateDoc.mock.calls[0][1];
  expect(update.lastUpdatedBy).toBe('u1');
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url2')
  );

  fireEvent.click(screen.getByLabelText('Request Edit'));
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByLabelText('Request Edit'));
  fireEvent.change(screen.getByPlaceholderText('Add comments...'), {
    target: { value: 'fix' },
  });
  fireEvent.click(screen.getByText('Submit'));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());

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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    if (col[1] === 'adGroups' && col[col.length - 1] === 'assets')
      return Promise.resolve(relatedSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'rev.png'));

  fireEvent.click(screen.getByText('Approve'));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());

  const paths = updateDoc.mock.calls.map((c) => c[0]);
  expect(paths).toContain('adGroups/group1/assets/rev2');
  expect(paths).toContain('adGroups/group1/assets/orig1');
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

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

  await waitFor(() => screen.getByText("You've approved 2 ads."));

  expect(screen.getByText('Group 1')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

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

  await waitFor(() => screen.getByText("You've approved 2 ads."));
  expect(screen.getByText("You've approved 2 ads.")).toBeInTheDocument();
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets')
      return Promise.resolve({ docs: assetSnapshot.docs.filter((d) => !d.data().isResolved) });
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Approve'));
  fireEvent.animationEnd(screen.getByAltText('Ad').parentElement);

  await waitFor(() => screen.getByText("You've approved 1 ads."));
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

  getDoc.mockResolvedValue(groupDoc);
  getDocs.mockImplementation((args) => {
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

  await waitFor(() => screen.getByText("You've approved 1 ads."));
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

  getDoc.mockResolvedValue(groupDoc);
  getDocs.mockImplementation((args) => {
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

  getDoc.mockResolvedValue(groupDoc);
  getDocs.mockImplementation((args) => {
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

  await waitFor(() => screen.getByText("You've approved 1 ads."));

  const lastViewedCall = setItem.mock.calls.find(
    (c) => c[0] === 'lastViewed-group1'
  );
  expect(lastViewedCall).toBeTruthy();

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

  getDoc.mockResolvedValue(groupDoc);
  getDocs.mockImplementation((args) => {
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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1' }) });

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

  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnapshot);
    return Promise.resolve({ docs: [] });
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group 1', status: 'pending' }) });

  const err = new Error('nope');
  err.code = 'permission-denied';
  updateDoc.mockRejectedValue(err);

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

test('opening reviewed group status unchanged on exit', async () => {
  const groupDoc = {
    exists: () => true,
    data: () => ({ name: 'Group 1', status: 'reviewed', brandCode: 'BR1' }),
  };
  const assetSnapshot = {
    docs: [
      {
        id: 'asset1',
        data: () => ({
          firebaseUrl: 'url1',
          status: 'approved',
          isResolved: true,
          adGroupId: 'group1',
          brandCode: 'BR1',
        }),
      },
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

  const { unmount } = render(<Review user={{ uid: 'u1' }} groupId="group1" />);

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'url1')
  );

  fireEvent.click(screen.getByText('Review Ads'));
  unmount();

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  expect(updateDoc).toHaveBeenCalledTimes(1);
  expect(updateDoc).toHaveBeenCalledWith('adGroups/group1', {
    status: 'reviewed',
    reviewProgress: null,
  });
});

