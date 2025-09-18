import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SignUpStepper from './SignUpStepper';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));

const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSendEmailVerification = jest.fn();
const mockSetDoc = jest.fn();
const mockDoc = jest.fn(() => 'userDoc');
const mockNavigate = jest.fn();

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: any[]) => mockCreateUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: any[]) => mockSendEmailVerification(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => mockDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('sends verification email after signup', async () => {
  mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<SignUpStepper />);

  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Tester' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 't@e.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(mockSendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
  expect(mockSetDoc).toHaveBeenCalledWith(
    'userDoc',
    expect.objectContaining({
      fullName: 'Tester',
      email: 't@e.com',
      subscriptionPlanId: null,
      credits: 0,
      lastCreditReset: expect.anything(),
      stripeCustomerId: null,
    })
  );
});

test('shows MFA choices after account creation and navigates when selecting authenticator app', async () => {
  mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<SignUpStepper />);

  fireEvent.change(screen.getByLabelText('Full Name'), {
    target: { value: 'Tester' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 't@e.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'pass' },
  });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() =>
    expect(screen.getByText(/Use an authenticator app/i)).toBeInTheDocument()
  );

  fireEvent.click(screen.getByText(/Use an authenticator app/i));

  expect(mockNavigate).toHaveBeenCalledWith('/mfa-settings', {
    state: { recommendedEnrollment: 'totp', fromSignUp: true },
  });
});

test('allows choosing SMS MFA during sign up flow', async () => {
  mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<SignUpStepper />);

  fireEvent.change(screen.getByLabelText('Full Name'), {
    target: { value: 'Tester' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 't@e.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'pass' },
  });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() =>
    expect(screen.getByText(/Use text message codes/i)).toBeInTheDocument()
  );

  fireEvent.click(screen.getByText(/Use text message codes/i));

  expect(mockNavigate).toHaveBeenCalledWith('/mfa-settings', {
    state: { recommendedEnrollment: 'sms', fromSignUp: true },
  });
});
