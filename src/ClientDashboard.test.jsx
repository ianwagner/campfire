import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientDashboard from './ClientDashboard';

jest.mock('./firebase/config', () => ({ db: {}, auth: {} }));

const getDocs = jest.fn();
const updateDoc = jest.fn();
const docMock = jest.fn((...args) => args.slice(1).join('/'));
const collectionMock = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: (...args) => collectionMock(...args),
  getDocs: (...args) => getDocs(...args),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  doc: (...args) => docMock(...args),
  updateDoc: (...args) => updateDoc(...args),
}));

test('computes summary for groups missing data', async () => {
  const groupSnap = {
    docs: [
      { id: 'g1', data: () => ({ brandCode: 'B1', status: 'ready' }) },
    ],
  };
  const assetSnap = {
    docs: [
      { data: () => ({ firebaseUrl: 'url1', status: 'approved' }) },
      { data: () => ({ firebaseUrl: 'url2', status: 'rejected' }) },
    ],
  };
  getDocs.mockImplementation((args) => {
    const col = Array.isArray(args) ? args[0] : args;
    if (col[1] === 'assets') return Promise.resolve(assetSnap);
    return Promise.resolve(groupSnap);
  });

  render(
    <MemoryRouter>
      <ClientDashboard user={{ uid: 'u1', metadata: {} }} brandCodes={['B1']} />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('APPROVED 1'));
  expect(screen.getByText('REJECTED 1')).toBeInTheDocument();
  expect(updateDoc).toHaveBeenCalledWith(
    'adGroups/g1',
    expect.objectContaining({ approvedCount: 1, rejectedCount: 1 })
  );
});
