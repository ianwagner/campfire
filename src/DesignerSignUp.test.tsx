import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DesignerSignUp from './DesignerSignUp.tsx';

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));

const createUserWithEmailAndPassword = jest.fn();
const sendEmailVerification = jest.fn();
const setDoc = jest.fn();
const docMock = jest.fn(() => 'userDoc');
const getDocs = jest.fn(() => ({ docs: [] }));
const collectionMock = jest.fn();
const navigate = jest.fn();

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: any[]) => createUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: any[]) => sendEmailVerification(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => docMock(...args),
  setDoc: (...args: any[]) => setDoc(...args),
  getDocs: (...args: any[]) => getDocs(...args),
  collection: (...args: any[]) => collectionMock(...args),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('sends verification email and navigates after signup', async () => {
  createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  render(<DesignerSignUp />);

  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 't@e.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(sendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
  expect(setDoc).toHaveBeenCalledWith('userDoc', expect.objectContaining({ role: 'designer' }));
  expect(navigate).toHaveBeenCalledWith('/mfa-settings');
});
