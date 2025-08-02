import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipeTypeCard from './RecipeTypeCard.jsx';

test('renders description under title', () => {
  const type = { id: '1', name: 'Test Recipe', description: 'A sample description' };
  render(<RecipeTypeCard type={type} />);
  expect(screen.getByText('A sample description')).toBeInTheDocument();
});

test('omits description when size is small', () => {
  const type = { id: '1', name: 'Test Recipe', description: 'A sample description' };
  render(<RecipeTypeCard type={type} size="small" />);
  expect(screen.queryByText('A sample description')).not.toBeInTheDocument();
});
