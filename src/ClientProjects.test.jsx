import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ClientProjects from './ClientProjects';

jest.mock('./firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(() => ({ set: jest.fn(), commit: jest.fn() })),
  doc: jest.fn(),
  getDoc: jest.fn(),
  Timestamp: { fromDate: jest.fn() },
}));

jest.mock('./useSiteSettings', () => jest.fn(() => ({ settings: {} })));

jest.mock('./RecipePreview.jsx', () => () => <div data-testid="recipe-preview" />);
jest.mock('./DescribeProjectModal.jsx', () => ({ onClose }) => (
  <button type="button" onClick={() => onClose(null)}>
    Close Describe
  </button>
));

jest.mock('./components/OptimizedImage.jsx', () => () => <div data-testid="artwork" />);

jest.mock('./useUserRole', () => () => ({ agencyId: null }));

jest.mock('./useAgencyTheme', () =>
  jest.fn(() => ({ agency: { enableDescribeProject: true, enableGenerateBrief: true } }))
);
import useAgencyTheme from './useAgencyTheme';

const { auth } = require('./firebase/config');

beforeEach(() => {
  jest.clearAllMocks();
  delete auth.currentUser.displayName;
});

test('shows upgrade notice linking to ad groups', () => {
  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  const notice = screen.getByText('Projects have been upgraded - see them here:', {
    exact: false,
  });
  const link = screen.getByRole('link', { name: 'Ad Groups' });
  expect(notice).toBeInTheDocument();
  expect(link).toHaveAttribute('href', '/ad-groups');
});

test('personalizes greeting when display name is available', () => {
  auth.currentUser.displayName = 'Jane Smith';

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  expect(
    screen.getByText('Hey Jane, how would you like to start?')
  ).toBeInTheDocument();
});

test('opens create project modal when button clicked', () => {
  useAgencyTheme.mockReturnValueOnce({
    agency: { enableDescribeProject: false, enableGenerateBrief: true },
  });

  render(
    <MemoryRouter>
      <ClientProjects brandCodes={['B1']} />
    </MemoryRouter>
  );

  const createButton = screen.getByText('Create Project');
  fireEvent.click(createButton);

  expect(screen.getByText('New Project')).toBeInTheDocument();
  expect(screen.getByTestId('recipe-preview')).toBeInTheDocument();
});

