import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DesignerSignUp from './DesignerSignUp.tsx';

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

test('sends verification email and navigates after signup', async () => {
  mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<DesignerSignUp />);

  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 't@e.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(mockSendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
  expect(mockSetDoc).toHaveBeenCalledWith(
    'userDoc',
    expect.objectContaining({
      role: 'designer',
      audience: 'designer',
      plan: 'free',
      isPaid: false,
      credits: 10,
      stripeCustomerId: null,
    })
  );
  expect(mockNavigate).toHaveBeenCalledWith('/mfa-settings');
});
