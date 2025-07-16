import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RequestCard from './RequestCard.jsx';

const noop = () => {};

test('create button disabled when status not ready', () => {
  const req = { id: '1', status: 'pending', brandCode: 'B', numAds: 1 };
  render(
    <RequestCard
      request={req}
      onEdit={noop}
      onDelete={noop}
      onArchive={noop}
      onCreateGroup={noop}
      onDragStart={noop}
    />
  );
  fireEvent.click(screen.getByTestId('request-card'));
  const btn = screen.getByText('Create Ad Group');
  expect(btn).toBeDisabled();
});

test('shows created text when status done', () => {
  const req = { id: '1', status: 'done', brandCode: 'B', numAds: 1 };
  render(
    <RequestCard
      request={req}
      onEdit={noop}
      onDelete={noop}
      onArchive={noop}
      onCreateGroup={noop}
      onDragStart={noop}
    />
  );
  fireEvent.click(screen.getByTestId('request-card'));
  expect(screen.getByText('Ad Group Created')).toBeInTheDocument();
});


