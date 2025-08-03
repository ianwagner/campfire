import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SignUpStepper from './SignUpStepper';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));

const createUserWithEmailAndPassword = jest.fn();
const sendEmailVerification = jest.fn();
const setDoc = jest.fn();
const docMock = jest.fn(() => 'userDoc');
const serverTimestamp = jest.fn(() => 'ts');
const navigate = jest.fn();

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: any[]) => createUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: any[]) => sendEmailVerification(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => docMock(...args),
  setDoc: (...args: any[]) => setDoc(...args),
  serverTimestamp: () => serverTimestamp(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('sends verification email after signup', async () => {
  createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<SignUpStepper />);

  fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Tester' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 't@e.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(sendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
  expect(setDoc).toHaveBeenCalledWith(
    'userDoc',
    expect.objectContaining({
      companyName: 'Acme',
      fullName: 'Tester',
      email: 't@e.com',
      subscriptionPlanId: 'free',
      credits: 10,
      lastCreditReset: expect.anything(),
      stripeCustomerId: null,
    })
  );
});

test('navigates to MFA enrollment after account creation', async () => {
  createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<SignUpStepper />);

  fireEvent.change(screen.getByLabelText('Company Name'), {
    target: { value: 'Acme' },
  });
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

  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/mfa-settings'));
});
