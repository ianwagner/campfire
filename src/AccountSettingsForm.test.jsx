import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccountSettingsForm from './AccountSettingsForm';

jest.mock('./firebase/config', () => ({
  auth: { currentUser: { uid: 'u1', displayName: 'Old', email: 'old@e.com' } },
  db: {},
}));

const updateProfile = jest.fn();
const updateEmail = jest.fn();
const updatePassword = jest.fn();
const updateDoc = jest.fn();
const docMock = jest.fn(() => 'users/u1');

jest.mock('firebase/auth', () => ({
  updateProfile: (...args) => updateProfile(...args),
  updateEmail: (...args) => updateEmail(...args),
  updatePassword: (...args) => updatePassword(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  updateDoc: (...args) => updateDoc(...args),
}));

afterEach(() => {
  jest.clearAllMocks();
});

test('updates profile information', async () => {
  render(<AccountSettingsForm />);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@e.com' } });
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'pass' } });
  fireEvent.click(screen.getByText('Save Changes'));
  await waitFor(() => expect(updateProfile).toHaveBeenCalled());
  expect(updateProfile).toHaveBeenCalledWith(expect.any(Object), { displayName: 'New' });
  expect(updateEmail).toHaveBeenCalledWith(expect.any(Object), 'new@e.com');
  expect(updatePassword).toHaveBeenCalledWith(expect.any(Object), 'pass');
  expect(updateDoc).toHaveBeenCalledWith('users/u1', { fullName: 'New', email: 'new@e.com' });
});
