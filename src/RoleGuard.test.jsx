import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoleGuard from './RoleGuard';

jest.mock('./LoadingOverlay', () => () => <div>Loading</div>);

const Navigate = jest.fn(({ to }) => <div>Navigate:{to}</div>);

jest.mock('react-router-dom', () => ({
  Navigate: (props) => Navigate(props),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('renders children when admin claim present', () => {
  const { getByText } = render(
    <RoleGuard requiredRole="admin" userRole="designer" isAdmin={true} loading={false}>
      <div>Secret</div>
    </RoleGuard>
  );
  expect(getByText('Secret')).toBeInTheDocument();
  expect(Navigate).not.toHaveBeenCalled();
});

test('redirects when admin claim missing', () => {
  const { getByText } = render(
    <RoleGuard requiredRole="admin" userRole="designer" isAdmin={false} loading={false}>
      <div>Secret</div>
    </RoleGuard>
  );
  expect(getByText('Navigate:/dashboard/designer')).toBeInTheDocument();
});
