import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SignUpStepper from './SignUpStepper';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));

const createUserWithEmailAndPassword = jest.fn();
const sendEmailVerification = jest.fn();
const setDoc = jest.fn();
const addDoc = jest.fn(() => ({ id: 'a1' }));
const collectionMock = jest.fn(() => 'agenciesCollection');
const docMock = jest.fn(() => 'userDoc');
const navigate = jest.fn();

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: any[]) => createUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: any[]) => sendEmailVerification(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => docMock(...args),
  setDoc: (...args: any[]) => setDoc(...args),
  addDoc: (...args: any[]) => addDoc(...args),
  collection: (...args: any[]) => collectionMock(...args),
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
  fireEvent.click(screen.getByText('Next'));

  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Tester' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 't@e.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(sendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
  expect(addDoc).toHaveBeenCalled();
  expect(setDoc).toHaveBeenCalledWith('userDoc', expect.objectContaining({ agencyId: 'a1' }));
});

test('navigates to MFA enrollment after account creation', async () => {
  createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
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

  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/enroll-mfa'));
});
