import React, { useState, type FormEvent } from 'react';
import {
  RecaptchaVerifier,
  PhoneAuthProvider,
  multiFactor,
  sendEmailVerification,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase/config';

interface EnrollMfaProps {
  user: User | null;
  role: string;
}


const EnrollMfa: React.FC<EnrollMfaProps> = ({ user, role }) => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [verificationId, setVerificationId] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [step, setStep] = useState<'start' | 'verify' | 'done'>('start');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  if (!user || !['admin', 'client'].includes(role)) {
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
      const phoneOptions = { phoneNumber, session: mfaSession };
      const verifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        { size: 'invisible', callback: () => {} }
      );
      const id = await phoneProvider.verifyPhoneNumber(phoneOptions, verifier);
      setVerificationId(id);
      setStep('verify');
    } catch (err: any) {
      setError(err.message);
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
      await multiFactor(auth.currentUser!).enroll(cred, 'Phone');
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
      <div className="w-80">
        {step === 'start' && (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
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
      </div>
    </div>
  );
};

export default EnrollMfa;
