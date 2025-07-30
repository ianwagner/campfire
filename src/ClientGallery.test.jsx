import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClientGallery from './ClientGallery.jsx';

jest.mock('./firebase/config', () => ({ db: {} }));

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

const { getDocsMock: getDocs, whereMock } = require('firebase/firestore');

test('chunks brand codes when loading assets', async () => {
  getDocs
    .mockResolvedValueOnce({ docs: [{ id: 'a1', data: () => ({ name: 'a1', firebaseUrl: 'u1' }) }] })
    .mockResolvedValueOnce({ docs: [{ id: 'a2', data: () => ({ name: 'a2', firebaseUrl: 'u2' }) }] });

  const codes = Array.from({ length: 12 }, (_, i) => `B${i}`);
  render(<ClientGallery brandCodes={codes} />);

  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
  const brandCalls = whereMock.mock.calls.filter((c) => c[0] === 'brandCode');
  expect(brandCalls[0][2]).toEqual(codes.slice(0, 10));
  expect(brandCalls[1][2]).toEqual(codes.slice(10));
  expect(screen.getByAltText('a1')).toBeInTheDocument();
  expect(screen.getByAltText('a2')).toBeInTheDocument();
});
