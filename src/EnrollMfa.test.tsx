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
