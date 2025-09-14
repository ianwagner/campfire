import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewFlow3 from './ReviewFlow3.jsx';

jest.mock('./firebase/config', () => ({ db: {} }));

const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn((...args) => args.slice(1).join('/'));
const mockArrayUnion = jest.fn((val) => val);
const mockServerTimestamp = jest.fn(() => 'now');
const mockGetDoc = jest.fn(() => Promise.resolve({ exists: () => false }));
const mockSetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  arrayUnion: (...args) => mockArrayUnion(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

jest.mock('./components/OptimizedImage.jsx', () => ({ pngUrl, ...rest }) => (
  <img alt="img" src={pngUrl} {...rest} />
));
jest.mock('./components/VideoPlayer.jsx', () => (props) => <video {...props} />);

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test('review updates persist immediately and finalization does not resave', async () => {
  const groups = [
    {
      recipeCode: 'r1',
      assets: [
        { filename: 'BR_G1_R1_V1.png', adGroupId: 'g1' },
        { filename: 'BR_G1_R1_V2.mov', adGroupId: 'g1' },
      ],
    },
  ];

  jest.spyOn(Date, 'now').mockReturnValue(12345);

  render(<ReviewFlow3 groups={groups} reviewerName="Bob" />);

  // trigger edit request
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'edit requested' },
  });

  const commentBox = await screen.findByPlaceholderText('Add comments...');
  fireEvent.change(commentBox, { target: { value: 'needs work' } });
  fireEvent.click(screen.getByText('Submit'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith('adGroups/g1/recipes/r1', {
    status: 'edit requested',
    version: 2,
    type: 'motion',
    editHistory: {
      editCopy: '',
      comments: [{ author: 'Bob', text: 'needs work' }],
      reviewer: 'Bob',
      timestamp: 'now',
    },
  }));

  await waitFor(() =>
    expect(mockSetDoc).toHaveBeenCalledWith(
      'recipes/r1',
      {
        history: {
          timestamp: 12345,
          status: 'edit requested',
          user: 'Bob',
          editComment: 'needs work',
        },
      },
      { merge: true },
    ),
  );

  mockUpdateDoc.mockClear();
  mockSetDoc.mockClear();

  // finalize review should not trigger additional saves
  fireEvent.click(screen.getByText('Finalize Review'));
  expect(mockUpdateDoc).not.toHaveBeenCalled();
  expect(mockSetDoc).not.toHaveBeenCalled();
});
