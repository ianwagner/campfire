import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Review from './Review';

jest.mock('./firebase/config', () => ({ db: {} }));

jest.mock('./useAgencyTheme', () => () => ({ agency: { logoUrl: 'logo.png', name: 'Mock Agency' } }));

const getDocs = jest.fn();
const getDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  collectionGroup: jest.fn((...args) => args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  getDocs: (...args) => getDocs(...args),
  getDoc: (...args) => getDoc(...args),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  doc: jest.fn((...args) => args.slice(1).join('/')),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn((val) => val),
  increment: jest.fn((val) => val),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('renders agency logo once loaded', async () => {
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

  render(<Review user={{ uid: 'u1' }} brandCodes={['BR1']} agencyId="agency1" />);

  await waitFor(() => expect(screen.getByAltText('Mock Agency logo')).toBeInTheDocument());
});
