import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManageMfa from './ManageMfa';

jest.mock('./firebase/config', () => ({ auth: {} }));

const sendEmailVerification = jest.fn();

jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: jest.fn(),
  PhoneAuthProvider: jest.fn(() => ({ verifyPhoneNumber: jest.fn() })),
  multiFactor: jest.fn(() => ({ getSession: jest.fn() })),
  sendEmailVerification: (...args) => sendEmailVerification(...args),
  signOut: jest.fn(),
}));

const navigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('blocks enrollment when email is unverified', () => {
  render(<ManageMfa user={{ emailVerified: false } as any} role="admin" />);
  expect(screen.getByText(/Please verify your email/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Phone Number/i)).not.toBeInTheDocument();
});

test('resends verification email when button clicked', () => {
  render(<ManageMfa user={{ emailVerified: false } as any} role="admin" />);
  fireEvent.click(screen.getByText(/Resend Verification Email/i));
  expect(sendEmailVerification).toHaveBeenCalled();
});

test('formats phone number input to E.164 without adding country code', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="admin" />);
  const input = screen.getByLabelText(/Phone Number/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '5551234567' } });
  expect(input.value).toBe('+5551234567');
});

test('shows message when recent login required', async () => {
  const { multiFactor } = require('firebase/auth');
  multiFactor.mockReturnValue({
    getSession: jest.fn().mockRejectedValue({
      code: 'auth/requires-recent-login',
      message: 'need login',
    }),
  });

  render(
    <ManageMfa user={{ emailVerified: true } as any} role="admin" />
  );

  fireEvent.change(screen.getByLabelText(/Phone Number/i), {
    target: { value: '+10000000000' },
  });
  fireEvent.click(screen.getByText('Send Code'));

  expect(
    await screen.findByText(/Please sign in again to enroll MFA/i)
  ).toBeInTheDocument();
});

test('allows enrollment for agency role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="agency" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});

test('allows enrollment for designer role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="designer" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});

test('allows enrollment for manager role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="manager" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});

test('allows enrollment for project manager role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="project-manager" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});

test('allows enrollment for editor role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="editor" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});
