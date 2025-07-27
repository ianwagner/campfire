import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RequireMfa from './RequireMfa';

const navigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/dashboard/client' }),
}));

jest.mock('firebase/auth', () => ({
  multiFactor: jest.fn(),
}));

test('redirects to enroll page when no factors', () => {
  const { multiFactor } = require('firebase/auth');
  multiFactor.mockReturnValue({ enrolledFactors: [] });

  render(
    <RequireMfa user={{}} role="admin">
      <div>child</div>
    </RequireMfa>
  );

  expect(navigate).toHaveBeenCalledWith('/mfa-settings', { replace: true });
});

test('shows children when factors exist', () => {
  const { multiFactor } = require('firebase/auth');
  navigate.mockClear();
  multiFactor.mockReturnValue({ enrolledFactors: [{}] });

  render(
    <RequireMfa user={{}} role="admin">
      <div>child</div>
    </RequireMfa>
  );

  expect(screen.getByText('child')).toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();
});

test('redirects agency to enroll page when no factors', () => {
  const { multiFactor } = require('firebase/auth');
  navigate.mockClear();
  multiFactor.mockReturnValue({ enrolledFactors: [] });

  render(
    <RequireMfa user={{}} role="agency">
      <div>child</div>
    </RequireMfa>
  );

  expect(navigate).toHaveBeenCalledWith('/mfa-settings', { replace: true });
});

test('redirects manager to enroll page when no factors', () => {
  const { multiFactor } = require('firebase/auth');
  navigate.mockClear();
  multiFactor.mockReturnValue({ enrolledFactors: [] });

  render(
    <RequireMfa user={{}} role="manager">
      <div>child</div>
    </RequireMfa>
  );

  expect(navigate).toHaveBeenCalledWith('/mfa-settings', { replace: true });
});

test('redirects project manager to enroll page when no factors', () => {
  const { multiFactor } = require('firebase/auth');
  navigate.mockClear();
  multiFactor.mockReturnValue({ enrolledFactors: [] });

  render(
    <RequireMfa user={{}} role="project-manager">
      <div>child</div>
    </RequireMfa>
  );

  expect(navigate).toHaveBeenCalledWith('/mfa-settings', { replace: true });
});

test('redirects editor to enroll page when no factors', () => {
  const { multiFactor } = require('firebase/auth');
  navigate.mockClear();
  multiFactor.mockReturnValue({ enrolledFactors: [] });

  render(
    <RequireMfa user={{}} role="editor">
      <div>child</div>
    </RequireMfa>
  );

  expect(navigate).toHaveBeenCalledWith('/mfa-settings', { replace: true });
});
