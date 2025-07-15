import React, { useState, type FormEvent } from 'react';
import {
  RecaptchaVerifier,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase/config';
import { useNavigate } from 'react-router-dom';

interface ManageMfaProps {
  user: User | null;
  role: string;
}

/** MFA management and enrollment screen. Currently supports SMS-based MFA. */
const ManageMfa: React.FC<ManageMfaProps> = ({ user, role }) => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [verificationId, setVerificationId] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [step, setStep] = useState<'sms' | 'verify' | 'done'>('sms');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const navigate = useNavigate();
  const enrolled =
    user && multiFactor(user).enrolledFactors.length > 0;

  const disableMfa = async () => {
    if (!user || !enrolled) return;
    if (
      !window.confirm(
        'Turning off MFA makes your account more vulnerable. Are you sure you want to continue?'
      )
    )
      return;
    try {
      const factor = multiFactor(user).enrolledFactors[0];
      await multiFactor(user).unenroll(factor);
      setMessage('MFA disabled');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    return '+' + digits;
  };

  if (!user || !['admin', 'client', 'agency', 'designer', 'manager', 'editor'].includes(role)) {
    return <p className="p-4">MFA enrollment not allowed for this account.</p>;
  }

  if (!user.emailVerified) {
    return (
      <div className="flex justify-center p-4">
        <div className="w-80 space-y-2">
          <p>Please verify your email before enrolling MFA</p>
          <button
            type="button"
            className="w-full btn-primary"
            onClick={() => sendEmailVerification(user)}
          >
            Resend Verification Email
          </button>
        </div>
      </div>
    );
  }

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSending(true);
    try {
      const mfaSession = await multiFactor(auth.currentUser!).getSession();
      const phoneProvider = new PhoneAuthProvider(auth);
      const phoneOptions = {
        phoneNumber: formatPhoneNumber(phoneNumber),
        session: mfaSession,
      };
      const verifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        { size: 'invisible', callback: () => {} }
      );
      const id = await phoneProvider.verifyPhoneNumber(phoneOptions, verifier);
      setVerificationId(id);
      setStep('verify');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage('Please sign in again to enroll MFA.');
        await signOut(auth);
        navigate('/login');
      } else {
        setError(err.message);
      }
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(auth.currentUser!).enroll(assertion, 'Phone');
      setMessage('Enrollment complete');
      setStep('done');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex justify-center p-4">
      <div className="w-80 space-y-4">
        <h1 className="text-2xl mb-2">Two-Factor Authentication</h1>
        <p className="text-sm text-gray-600">
          Add an extra layer of security to your account by requiring a code when you sign in.
        </p>
        {enrolled && user?.metadata.lastLoginAt && (
          <p className="text-xs text-gray-500">
            Last MFA login: {new Date(Number(user.metadata.lastLoginAt)).toLocaleString()}
          </p>
        )}
        {step === 'sms' && (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                className="w-full p-2 border rounded"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" className="w-full btn-primary" disabled={sending}>
              {sending ? 'Sending...' : 'Send Code'}
            </button>
          </form>
        )}
        {step === 'verify' && (
          <form onSubmit={verifyCode} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" className="w-full btn-primary" disabled={verifying}>
              {verifying ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}
        {message && <p className="text-green-600 mt-2 text-sm">{message}</p>}
        <div id="recaptcha-container" />
        {enrolled && (
          <button type="button" onClick={disableMfa} className="w-full btn-secondary">
            Disable MFA
          </button>
        )}
      </div>
    </div>
  );
};

export default ManageMfa;
