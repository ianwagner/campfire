import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipeReview from './RecipeReview';

jest.mock('./firebase/config', () => ({ db: {} }));

const fetchReadyRecipes = jest.fn();
const recordRecipeDecision = jest.fn();
const getDocs = jest.fn();

jest.mock('./utils/recipeReview', () => ({
  fetchReadyRecipes: (...args) => fetchReadyRecipes(...args),
  recordRecipeDecision: (...args) => recordRecipeDecision(...args),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => args),
  getDocs: (...args) => getDocs(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('loads ready recipes and submits decision', async () => {
  fetchReadyRecipes.mockResolvedValue([
    { id: 'r1', groupId: 'g1' },
  ]);
  getDocs.mockResolvedValue({ docs: [{ id: 'a1', data: () => ({ firebaseUrl: 'u1', filename: 'BR_AD_REC_9x16_V1.png', aspectRatio: '9x16' }) }] });

  render(<RecipeReview user={{ uid: 'u1', email: 'e@test' }} brandCodes={['BR']} />);

  await waitFor(() => screen.getByRole('img'));

  fireEvent.click(screen.getByText('Approve'));

  expect(recordRecipeDecision).toHaveBeenCalledWith('g1', 'r1', 'approve', expect.any(Object), '');
});
