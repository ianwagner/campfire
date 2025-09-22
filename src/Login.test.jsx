import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Login from './Login';

jest.mock('./firebase/config', () => ({ auth: {} }));
jest.mock('./useSiteSettings', () => () => ({ settings: {}, loading: false }));
jest.mock('./utils/debugLog', () => jest.fn());

jest.mock('firebase/auth', () => {
  const mockSignInWithEmailAndPassword = jest.fn(() =>
    Promise.reject({ code: 'auth/wrong-password' })
  );
  const mockSendPasswordResetEmail = jest.fn(() => Promise.resolve());
  const mockGetMultiFactorResolver = jest.fn();
  const mockRecaptchaVerifier = jest.fn().mockImplementation(() => ({
    clear: jest.fn(),
  }));
  const mockPhoneVerifyNumber = jest.fn();
  const mockPhoneAuthProvider = jest.fn().mockImplementation(() => ({
    verifyPhoneNumber: mockPhoneVerifyNumber,
  }));
  mockPhoneAuthProvider.credential = jest.fn();
  const mockPhoneMultiFactorGenerator = {
    assertion: jest.fn(),
  };
  const mockTotpMultiFactorGenerator = {
    assertionForSignIn: jest.fn(),
  };

  return {
    signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
    sendPasswordResetEmail: mockSendPasswordResetEmail,
    getMultiFactorResolver: mockGetMultiFactorResolver,
    RecaptchaVerifier: mockRecaptchaVerifier,
    PhoneAuthProvider: mockPhoneAuthProvider,
    PhoneMultiFactorGenerator: mockPhoneMultiFactorGenerator,
    TotpMultiFactorGenerator: mockTotpMultiFactorGenerator,
    __mockPhoneVerifyNumber: mockPhoneVerifyNumber,
  };
});

import {
  signInWithEmailAndPassword as mockSignInWithEmailAndPassword,
  sendPasswordResetEmail as mockSendPasswordResetEmail,
  getMultiFactorResolver as mockGetMultiFactorResolver,
  PhoneAuthProvider as mockPhoneAuthProvider,
  PhoneMultiFactorGenerator as mockPhoneMultiFactorGenerator,
  TotpMultiFactorGenerator as mockTotpMultiFactorGenerator,
  __mockPhoneVerifyNumber as mockPhoneVerifyNumber,
} from 'firebase/auth';

afterEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

test('shows reset prompt after wrong password and sends email', async () => {
  render(<Login />);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'test@e.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'bad' },
  });
  const signInBtn = screen.getByRole('button', { name: 'Sign In' });
  fireEvent.click(signInBtn);
  expect(signInBtn).toBeDisabled();
  fireEvent.click(signInBtn);
  expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);

  await waitFor(() =>
    expect(screen.getByText('Forgot password?')).toBeInTheDocument()
  );

  fireEvent.click(screen.getByText('Forgot password?'));

  await waitFor(() =>
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      expect.anything(),
      'test@e.com'
    )
  );
  expect(screen.getByText('Password reset email sent.')).toBeInTheDocument();
});

test('prefers authenticator app when stored preference exists', async () => {
  window.localStorage.setItem('campfire:mfaPreference:email:user@example.com', 'totp1');
  mockSignInWithEmailAndPassword.mockImplementationOnce(() =>
    Promise.reject({ code: 'auth/multi-factor-auth-required' })
  );
  mockGetMultiFactorResolver.mockReturnValue({
    hints: [
      { factorId: 'phone', uid: 'phone1', phoneNumber: '+1*******123' },
      { factorId: 'totp', uid: 'totp1', displayName: 'Authenticator' },
    ],
    session: {},
    resolveSignIn: jest.fn(),
  });

  render(<Login />);

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'secret' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  await waitFor(() =>
    expect(screen.getByLabelText(/Authenticator app code/i)).toBeInTheDocument()
  );

  expect(screen.getByLabelText(/Verification method/i)).toHaveValue('totp1');
  expect(mockPhoneVerifyNumber).not.toHaveBeenCalled();
});
