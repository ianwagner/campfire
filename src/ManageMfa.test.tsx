import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManageMfa from './ManageMfa';

jest.mock('./firebase/config', () => ({ auth: {} }));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
}));

jest.mock('firebase/auth', () => {
  const sendEmailVerification = jest.fn();
  const multiFactorMock = jest.fn(() => ({
    getSession: jest.fn().mockResolvedValue({}),
    enrolledFactors: [],
  }));
  return {
    RecaptchaVerifier: jest.fn(),
    PhoneAuthProvider: jest.fn(() => ({ verifyPhoneNumber: jest.fn() })),
    PhoneMultiFactorGenerator: { assertion: jest.fn() },
    TotpMultiFactorGenerator: {
      generateSecret: jest.fn(),
      assertionForEnrollment: jest.fn(),
    },
    multiFactor: multiFactorMock,
    sendEmailVerification,
    signOut: jest.fn(),
  };
});

import { sendEmailVerification } from 'firebase/auth';
import { TotpMultiFactorGenerator } from 'firebase/auth';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
  };
});

beforeEach(() => {
  const { multiFactor } = require('firebase/auth');
  (multiFactor as jest.Mock).mockImplementation(() => ({
    getSession: jest.fn().mockResolvedValue({}),
    enrolledFactors: [],
  }));
});

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
  multiFactor.mockImplementation(() => ({
    getSession: jest.fn().mockRejectedValue({
      code: 'auth/requires-recent-login',
      message: 'need login',
    }),
    enrolledFactors: [],
  }));

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

test('allows enrollment for ops role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="ops" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});

test('allows enrollment for editor role', () => {
  render(<ManageMfa user={{ emailVerified: true } as any} role="editor" />);
  expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
});

test('can generate authenticator enrollment details', async () => {
  const secret = {
    generateQrCodeUrl: jest.fn().mockReturnValue('otpauth://example'),
    secretKey: 'SECRETKEY',
  } as any;
  (TotpMultiFactorGenerator.generateSecret as jest.Mock).mockResolvedValue(secret);

  render(<ManageMfa user={{ emailVerified: true } as any} role="admin" />);

  await act(async () => {
    fireEvent.click(screen.getByText('Authenticator App'));
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Generate QR Code'));
  });

  await waitFor(() => expect(TotpMultiFactorGenerator.generateSecret).toHaveBeenCalled());

  expect(await screen.findByLabelText(/Authenticator Code/i)).toBeInTheDocument();
  await waitFor(() => expect(secret.generateQrCodeUrl).toHaveBeenCalled());
  expect(await screen.findByText(/Can't scan the code/i)).toBeInTheDocument();
});
