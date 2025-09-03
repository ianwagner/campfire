import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusBadge from './StatusBadge.jsx';

test('renders select when editable and triggers onChange', () => {
  const handleChange = jest.fn();
  render(<StatusBadge status="pending" editable onChange={handleChange} />);
  const select = screen.getByDisplayValue('pending');
  fireEvent.change(select, { target: { value: 'done' } });
  expect(handleChange).toHaveBeenCalledWith('done');
});

