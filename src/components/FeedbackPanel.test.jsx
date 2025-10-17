import { fireEvent, render, screen } from '@testing-library/react';
import FeedbackPanel from './FeedbackPanel.jsx';

const sampleEntries = [
  {
    id: 'edit-1',
    type: 'edit',
    title: 'Ad A',
    subtitle: 'Recipe 101 • 1080x1080 • V2',
    comment: 'Please tweak the headline.',
    copyEdit: 'Fresh headline copy',
    copyEditDiff: 'Fresh headline copy',
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    updatedBy: 'Client McClientface',
    adStatus: 'edit_requested',
    assetId: 'asset-1',
    adUrl: 'https://example.com/ad-a.png',
    recipeCode: '101',
  },
  {
    id: 'general-1',
    type: 'general',
    title: 'General feedback',
    comment: 'Great work on this set!',
    updatedAt: new Date('2024-01-10T08:00:00Z'),
    updatedBy: 'Account Manager',
  },
];

test('renders feedback entries and shows details for the selected item', () => {
  render(<FeedbackPanel entries={sampleEntries} />);

  expect(screen.getByText('Ad A')).toBeInTheDocument();
  expect(screen.getByText('Please tweak the headline.')).toBeInTheDocument();
  expect(screen.getByText('Fresh headline copy')).toBeInTheDocument();
});

test('filters entries based on the search term', () => {
  render(<FeedbackPanel entries={sampleEntries} />);

  const search = screen.getByPlaceholderText('Search feedback...');
  fireEvent.change(search, { target: { value: 'general' } });

  expect(screen.getByText('General feedback')).toBeInTheDocument();
  expect(screen.queryByText('Ad A')).not.toBeInTheDocument();
});

test('invokes onOpenAsset when the view ad button is clicked', () => {
  const handleOpen = jest.fn();
  render(<FeedbackPanel entries={sampleEntries} onOpenAsset={handleOpen} />);

  const viewButton = screen.getByRole('button', { name: /view ad/i });
  fireEvent.click(viewButton);

  expect(handleOpen).toHaveBeenCalledWith('asset-1');
});

test('renders scope selector when options are provided', () => {
  const handleScope = jest.fn();
  render(
    <FeedbackPanel
      entries={sampleEntries}
      scopeOptions={[
        { value: 'current', label: 'This group' },
        { value: 'all', label: 'All groups' },
      ]}
      selectedScope="current"
      onScopeChange={handleScope}
    />,
  );

  const scopeSelect = screen.getByLabelText('Showing');
  fireEvent.change(scopeSelect, { target: { value: 'all' } });

  expect(handleScope).toHaveBeenCalledWith('all');
});

