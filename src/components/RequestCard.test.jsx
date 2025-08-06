import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RequestCard from './RequestCard.jsx';

const noop = () => {};

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
  }
});

test('shows create button when status ready without expanding', () => {
  const req = { id: '1', status: 'ready', brandCode: 'B', numAds: 1 };
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
  const btn = screen.getByText('Create Ad Group');
  expect(btn).toBeEnabled();
});

test('shows due date without expanding', () => {
  const due = new Date('2024-05-01');
  const req = {
    id: '1',
    status: 'pending',
    dueDate: { toDate: () => due },
  };
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
  expect(screen.getByText(due.toLocaleDateString())).toBeInTheDocument();
});

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


