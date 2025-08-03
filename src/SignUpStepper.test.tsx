import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SignUpStepper from './SignUpStepper';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));

const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSendEmailVerification = jest.fn();
const mockSetDoc = jest.fn();
const mockAddDoc = jest.fn(() => ({ id: 'a1' }));
const mockCollection = jest.fn(() => 'agenciesCollection');
const mockDoc = jest.fn(() => 'userDoc');
const mockNavigate = jest.fn();

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: any[]) => mockCreateUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: any[]) => mockSendEmailVerification(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => mockDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  collection: (...args: any[]) => mockCollection(...args),
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

  fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Acme' } });
  fireEvent.click(screen.getByText('Next'));

  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Tester' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 't@e.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(mockSendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
  expect(mockAddDoc).toHaveBeenCalled();
  expect(mockSetDoc).toHaveBeenCalledWith(
    'userDoc',
    expect.objectContaining({
      agencyId: 'a1',
      audience: 'agency',
      plan: 'free',
      isPaid: false,
      credits: 10,
      stripeCustomerId: null,
    })
  );
});

test('navigates to MFA enrollment after account creation', async () => {
  mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<SignUpStepper />);

  fireEvent.change(screen.getByLabelText('Company Name'), {
    target: { value: 'Acme' },
  });
  fireEvent.click(screen.getByText('Next'));

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
