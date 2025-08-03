import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClientGallery from './ClientGallery.jsx';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn() }));

jest.mock('./components/OptimizedImage.jsx', () => (props) => <img {...props} />);
jest.mock('./components/VideoPlayer.jsx', () => (props) => <video {...props} />);

jest.mock('firebase/firestore', () => {
  const getDocsMock = jest.fn();
  const collectionMock = jest.fn((...args) => args);
  const queryMock = jest.fn((...args) => args);
  const whereMock = jest.fn((...args) => args);
  return {
    collection: (...args) => collectionMock(...args),
    getDocs: (...args) => getDocsMock(...args),
    query: (...args) => queryMock(...args),
    where: (...args) => whereMock(...args),
    __esModule: true,
    getDocsMock,
    collectionMock,
    queryMock,
    whereMock,
  };
});

const { getDocsMock: getDocs, whereMock, collectionMock } = require('firebase/firestore');
const authModule = require('firebase/auth');

beforeEach(() => {
  authModule.onAuthStateChanged.mockImplementation((_, cb) => {
    cb({ uid: 'u1' });
    return () => {};
  });
});

test('loads assets for each brand code', async () => {
  getDocs.mockResolvedValue({
    docs: [
      { id: 'a1', data: () => ({ name: 'a1', firebaseUrl: 'u1' }) },
    ],
  });

  const codes = ['B1', 'B2'];
  render(<ClientGallery brandCodes={codes} />);

  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
  expect(collectionMock).toHaveBeenCalledWith({}, 'adAssets');
  expect(whereMock).toHaveBeenCalledWith('status', '==', 'approved');
  expect(whereMock).toHaveBeenCalledWith('brandCode', 'in', codes);
  expect(await screen.findByAltText('a1')).toBeInTheDocument();
});

