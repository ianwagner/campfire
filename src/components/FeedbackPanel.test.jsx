import { render, screen, fireEvent } from '@testing-library/react';
import FeedbackPanel from './FeedbackPanel.jsx';

const sample = [
  {
    id: '1',
    updatedBy: 'Alice',
    updatedAt: new Date('2023-01-01').toISOString(),
    status: 'approved',
    comment: 'old',
  },
  {
    id: '2',
    updatedBy: 'Bob',
    updatedAt: new Date('2023-02-01').toISOString(),
    status: 'rejected',
    comment: 'new',
  },
];

test('shows latest entry and reveals all on click', () => {
  render(<FeedbackPanel entries={sample} collapsible />);
  expect(screen.getByText('rejected')).toBeInTheDocument();
  expect(screen.queryByText('approved')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /see all/i }));
  expect(screen.getByText('approved')).toBeInTheDocument();
});

