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
  const navigate = useNavigate();

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    let e164 = digits;
    if (digits[0] !== '1' && digits.length === 10) {
      e164 = '1' + digits;
    }
    return '+' + e164;
  };

  if (!user || !['admin', 'client', 'agency'].includes(role)) {
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
      <div className="w-80">
        {step === 'start' && (
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
      </div>
    </div>
  );
};

export default EnrollMfa;
