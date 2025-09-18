import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManageMfa from './ManageMfa';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,QR')),
}));

jest.mock('./firebase/config', () => ({
  auth: { currentUser: null },
}));

const mockTotpSecret = {
  secretKey: 'SECRETKEY',
  codeLength: 6,
  codeIntervalSeconds: 30,
  enrollmentCompletionDeadline: new Date('2024-01-01T00:00:00Z').toISOString(),
  generateQrCodeUrl: jest.fn(() => 'otpauth://totp/Campfire?secret=SECRETKEY'),
};

const mockVerifyPhoneNumber = jest.fn(() => Promise.resolve('verification-id'));
const mockGetSession = jest.fn(() => Promise.resolve({}));
const mockEnroll = jest.fn(() => Promise.resolve());
const mockUnenroll = jest.fn(() => Promise.resolve());
let mockEnrolledFactors: any[] = [];

jest.mock('firebase/auth', () => {
  const sendEmailVerification = jest.fn();
  const signOut = jest.fn();

  const multiFactor = jest.fn(() => ({
    enrolledFactors: mockEnrolledFactors,
    getSession: mockGetSession,
    enroll: mockEnroll,
    unenroll: mockUnenroll,
  }));

  const RecaptchaVerifier = jest.fn().mockImplementation(() => ({
    clear: jest.fn(),
  }));

  function PhoneAuthProviderMock() {
    return { verifyPhoneNumber: mockVerifyPhoneNumber };
  }
  PhoneAuthProviderMock.credential = jest.fn(() => ({}));

  const PhoneMultiFactorGenerator = {
    assertion: jest.fn(() => ({})),
    FACTOR_ID: 'phone',
  };

  const TotpMultiFactorGenerator = {
    FACTOR_ID: 'totp',
    generateSecret: jest.fn(() => Promise.resolve(mockTotpSecret)),
    assertionForEnrollment: jest.fn(() => ({})),
  };

  return {
    RecaptchaVerifier,
    PhoneAuthProvider: PhoneAuthProviderMock,
    PhoneMultiFactorGenerator,
    TotpMultiFactorGenerator,
    multiFactor,
    sendEmailVerification,
    signOut,
    __setEnrolledFactors: (factors: any[]) => {
      mockEnrolledFactors = factors;
    },
    __resetMocks: () => {
      mockVerifyPhoneNumber
        .mockReset()
        .mockImplementation(() => Promise.resolve('verification-id'));
      mockGetSession
        .mockReset()
        .mockImplementation(() => Promise.resolve({}));
      mockEnroll.mockReset().mockResolvedValue(undefined);
      mockUnenroll.mockReset().mockResolvedValue(undefined);
      multiFactor
        .mockReset()
        .mockImplementation(() => ({
          enrolledFactors: mockEnrolledFactors,
          getSession: mockGetSession,
          enroll: mockEnroll,
          unenroll: mockUnenroll,
        }));
      mockEnrolledFactors = [];
    },
  };
});

import { sendEmailVerification } from 'firebase/auth';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
  };
});

afterEach(() => {
  jest.clearAllMocks();
  const authModule = require('firebase/auth');
  authModule.__resetMocks();
});

const createUser = (overrides: Record<string, unknown> = {}) =>
  ({ emailVerified: true, metadata: {}, ...overrides } as any);

test('blocks enrollment when email is unverified', () => {
  render(<ManageMfa user={{ emailVerified: false } as any} role="admin" />);
  expect(screen.getByText(/Please verify your email/i)).toBeInTheDocument();
  expect(screen.queryByText(/Authenticator App/i)).not.toBeInTheDocument();
});

test('resends verification email when button clicked', () => {
  render(<ManageMfa user={{ emailVerified: false } as any} role="admin" />);
  fireEvent.click(screen.getByText(/Resend Verification Email/i));
  expect(sendEmailVerification).toHaveBeenCalled();
});

test('formats phone number input to E.164 without adding country code', async () => {
  render(<ManageMfa user={createUser()} role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /Add number/i }));
  const input = (await screen.findByLabelText(
    /Phone number/i
  )) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '5551234567' } });
  expect(input.value).toBe('+5551234567');
});

test('shows message when recent login required', async () => {
  const authModule = require('firebase/auth');
  authModule.multiFactor.mockReturnValue({
    enrolledFactors: [],
    getSession: jest.fn().mockRejectedValue({
      code: 'auth/requires-recent-login',
      message: 'need login',
    }),
    enroll: jest.fn(),
    unenroll: jest.fn(),
  });

  render(<ManageMfa user={createUser()} role="admin" />);
  fireEvent.click(screen.getByRole('button', { name: /Add number/i }));
  fireEvent.change(await screen.findByLabelText(/Phone number/i), {
    target: { value: '+10000000000' },
  });
  fireEvent.click(screen.getByText(/Send code/i));

  expect(
    await screen.findByText(/Please sign in again to manage MFA settings/i)
  ).toBeInTheDocument();
});

test('shows authenticator enrollment status when enrolled', () => {
  const authModule = require('firebase/auth');
  authModule.__setEnrolledFactors([
    {
      factorId: 'totp',
      displayName: 'Work phone',
      uid: 'totp1',
      enrollmentTime: '2024-01-01T00:00:00Z',
    },
  ]);

  render(
    <ManageMfa
      user={createUser({ metadata: { lastLoginAt: `${Date.now()}` } })}
      role="admin"
    />
  );

  expect(
    screen.getByText(/Status: Enrolled \(Work phone\)/i)
  ).toBeInTheDocument();
});

test('allows enrollment for agency role', () => {
  render(<ManageMfa user={createUser()} role="agency" />);
  expect(screen.getByText(/Authenticator App \(TOTP\)/i)).toBeInTheDocument();
});

test('allows enrollment for designer role', () => {
  render(<ManageMfa user={createUser()} role="designer" />);
  expect(screen.getByText(/Authenticator App \(TOTP\)/i)).toBeInTheDocument();
});

test('allows enrollment for manager role', () => {
  render(<ManageMfa user={createUser()} role="manager" />);
  expect(screen.getByText(/Authenticator App \(TOTP\)/i)).toBeInTheDocument();
});

test('allows enrollment for project manager role', () => {
  render(<ManageMfa user={createUser()} role="project-manager" />);
  expect(screen.getByText(/Authenticator App \(TOTP\)/i)).toBeInTheDocument();
});

test('allows enrollment for ops role', () => {
  render(<ManageMfa user={createUser()} role="ops" />);
  expect(screen.getByText(/Authenticator App \(TOTP\)/i)).toBeInTheDocument();
});

test('allows enrollment for editor role', () => {
  render(<ManageMfa user={createUser()} role="editor" />);
  expect(screen.getByText(/Authenticator App \(TOTP\)/i)).toBeInTheDocument();
});
