import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminAccountForm from './AdminAccountForm';

jest.mock('./AdminSidebar', () => () => <div />);

jest.mock('./firebase/config', () => ({ auth: {}, db: {} }));

const createUserWithEmailAndPassword = jest.fn();
const sendEmailVerification = jest.fn();

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args) => createUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args) => sendEmailVerification(...args),
}));

const setDoc = jest.fn();
const docMock = jest.fn(() => 'userDoc');

const getDocs = jest.fn();
const collectionMock = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  setDoc: (...args) => setDoc(...args),
  getDocs: (...args) => getDocs(...args),
  collection: (...args) => collectionMock(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('sends verification email when account is created', async () => {
  createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  getDocs.mockResolvedValue({ docs: [] });
  render(<AdminAccountForm />);

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Create Account'));

  await waitFor(() => expect(sendEmailVerification).toHaveBeenCalledWith({ uid: 'u1' }));
});
