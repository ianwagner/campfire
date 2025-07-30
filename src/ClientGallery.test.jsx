import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClientGallery from './ClientGallery.jsx';

jest.mock('./firebase/config', () => ({ db: {} }));

jest.mock('./components/OptimizedImage.jsx', () => (props) => <img {...props} />);
jest.mock('./components/VideoPlayer.jsx', () => (props) => <video {...props} />);

jest.mock('firebase/firestore', () => {
  const getDocsMock = jest.fn();
  const collectionGroupMock = jest.fn((...args) => args);
  const queryMock = jest.fn((...args) => args);
  const whereMock = jest.fn((...args) => args);
  return {
    collectionGroup: (...args) => collectionGroupMock(...args),
    getDocs: (...args) => getDocsMock(...args),
    query: (...args) => queryMock(...args),
    where: (...args) => whereMock(...args),
    __esModule: true,
    getDocsMock,
    collectionGroupMock,
    queryMock,
    whereMock,
  };
});

const { getDocsMock: getDocs, whereMock, collectionGroupMock } = require('firebase/firestore');

test('loads assets for each brand code', async () => {
  getDocs.mockResolvedValue({
    docs: [
      { id: 'a1', data: () => ({ name: 'a1', firebaseUrl: 'u1' }) },
    ],
  });

  const codes = ['B1', 'B2'];
  render(<ClientGallery brandCodes={codes} />);

  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(codes.length));
  expect(collectionGroupMock).toHaveBeenCalledWith({}, 'assets');
  const brandCalls = whereMock.mock.calls.filter((c) => c[0] === 'brandCode');
  expect(brandCalls.map((c) => c[2])).toEqual(codes);
  expect(screen.getByAltText('a1')).toBeInTheDocument();
});
