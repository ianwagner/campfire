import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EnrollMfa from './EnrollMfa';

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
  render(<EnrollMfa user={{ emailVerified: false } as any} role="admin" />);
  expect(screen.getByText(/Please verify your email/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Phone Number/i)).not.toBeInTheDocument();
});

test('resends verification email when button clicked', () => {
  render(<EnrollMfa user={{ emailVerified: false } as any} role="admin" />);
  fireEvent.click(screen.getByText(/Resend Verification Email/i));
  expect(sendEmailVerification).toHaveBeenCalled();
});

test('formats phone number input to E.164', () => {
  render(<EnrollMfa user={{ emailVerified: true } as any} role="admin" />);
  const input = screen.getByLabelText(/Phone Number/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '15551234567' } });
  expect(input.value).toBe('+15551234567');
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
    <EnrollMfa user={{ emailVerified: true } as any} role="admin" />
  );

  fireEvent.change(screen.getByLabelText(/Phone Number/i), {
    target: { value: '+10000000000' },
  });
  fireEvent.click(screen.getByText('Send Code'));

  expect(
    await screen.findByText(/Please sign in again to enroll MFA/i)
  ).toBeInTheDocument();
});
