import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Login from './Login';

jest.mock('./firebase/config', () => ({ auth: {} }));
jest.mock('./useSiteSettings', () => () => ({ settings: {}, loading: false }));

const signInWithEmailAndPassword = jest.fn(() =>
  Promise.reject({ code: 'auth/wrong-password' })
);
const sendPasswordResetEmail = jest.fn(() => Promise.resolve());

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args) => signInWithEmailAndPassword(...args),
  sendPasswordResetEmail: (...args) => sendPasswordResetEmail(...args),
  getMultiFactorResolver: jest.fn(),
  RecaptchaVerifier: jest.fn(),
  PhoneAuthProvider: jest.fn(),
  PhoneMultiFactorGenerator: jest.fn(),
}));

afterEach(() => {
  jest.clearAllMocks();
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
  expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1);

  await waitFor(() =>
    expect(screen.getByText('Forgot password?')).toBeInTheDocument()
  );

  fireEvent.click(screen.getByText('Forgot password?'));

  await waitFor(() =>
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'test@e.com')
  );
  expect(screen.getByText('Password reset email sent.')).toBeInTheDocument();
});
