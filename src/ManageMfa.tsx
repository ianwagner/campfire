import React, { useEffect, useState, type FormEvent } from 'react';
import {
  RecaptchaVerifier,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
  TotpMultiFactorGenerator,
  type TotpSecret,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase/config';
import { useNavigate } from 'react-router-dom';
import * as QRCode from 'qrcode';

interface ManageMfaProps {
  user: User | null;
  role: string;
}

/** MFA management and enrollment screen supporting SMS and authenticator app factors. */
const ManageMfa: React.FC<ManageMfaProps> = ({ user, role }) => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [verificationId, setVerificationId] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [smsStep, setSmsStep] = useState<'enter' | 'verify' | 'done'>('enter');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [activeMethod, setActiveMethod] = useState<'sms' | 'authenticator'>('sms');
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpStep, setTotpStep] = useState<'initial' | 'verify' | 'done'>('initial');
  const [totpCode, setTotpCode] = useState<string>('');
  const [totpLoading, setTotpLoading] = useState<boolean>(false);
  const [otpAuthUri, setOtpAuthUri] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const navigate = useNavigate();
  const enrolled =
    user && multiFactor(user).enrolledFactors.length > 0;

  useEffect(() => {
    let cancelled = false;
    if (!otpAuthUri) {
      setQrCodeDataUrl('');
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(otpAuthUri, { margin: 1, width: 200 })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          console.error('Failed to render MFA QR code', err);
          setError('Unable to render QR code. Please try again.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [otpAuthUri]);

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

  if (!user || !['admin', 'client', 'agency', 'designer', 'manager', 'project-manager', 'editor', 'ops'].includes(role)) {
    return (
      <div className="flex min-h-screen w-full justify-center bg-gray-100 p-4 dark:bg-[var(--dark-bg)]">
        <div className="w-full max-w-md space-y-3 rounded-lg border border-gray-200 bg-white p-6 text-center shadow-md dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]">
          <h1 className="text-2xl">Two-Factor Authentication</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            MFA enrollment is not available for this account.
          </p>
        </div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="flex min-h-screen w-full justify-center bg-gray-100 p-4 dark:bg-[var(--dark-bg)]">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6 text-center shadow-md dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]">
          <h1 className="text-2xl">Verify your email</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Please verify your email address before enrolling in multi-factor authentication.
          </p>
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
    setActiveMethod('sms');
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
      setCode('');
      setSmsStep('verify');
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
      setSmsStep('done');
      setCode('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const startTotpEnrollment = async () => {
    setError('');
    setMessage('');
    setTotpLoading(true);
    try {
      const session = await multiFactor(auth.currentUser!).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const uri = secret.generateQrCodeUrl();
      setTotpSecret(secret);
      setOtpAuthUri(uri);
      setTotpStep('verify');
      setTotpCode('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage('Please sign in again to enroll MFA.');
        await signOut(auth);
        navigate('/login');
      } else {
        setError(err.message);
      }
    } finally {
      setTotpLoading(false);
    }
  };

  const verifyTotpCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!totpSecret) return;
    setError('');
    setTotpLoading(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        totpCode
      );
      await multiFactor(auth.currentUser!).enroll(
        assertion,
        'Authenticator App'
      );
      setMessage('Authenticator app enrollment complete');
      setTotpStep('done');
      setTotpSecret(null);
      setOtpAuthUri('');
      setTotpCode('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTotpLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full justify-center bg-gray-100 p-4 dark:bg-[var(--dark-bg)]">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-md dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]">
        <h1 className="text-2xl">Two-Factor Authentication</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Add an extra layer of security to your account by requiring a code when you sign in.
        </p>
        {enrolled && user?.metadata.lastLoginAt && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Last MFA login: {new Date(Number(user.metadata.lastLoginAt)).toLocaleString()}
          </p>
        )}
        <div className="flex gap-2 rounded-md bg-gray-100 p-1 text-sm font-medium dark:bg-[var(--dark-sidebar-hover)]">
          <button
            type="button"
            onClick={() => {
              setActiveMethod('sms');
              setError('');
            }}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              activeMethod === 'sms'
                ? 'bg-white text-gray-900 shadow dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]'
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white'
            }`}
          >
            Text Message
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMethod('authenticator');
              setError('');
            }}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              activeMethod === 'authenticator'
                ? 'bg-white text-gray-900 shadow dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]'
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white'
            }`}
          >
            Authenticator App
          </button>
        </div>
        {activeMethod === 'sms' && (
          <div className="space-y-4">
            {smsStep === 'enter' && (
              <form onSubmit={sendCode} className="space-y-4">
                <div>
                  <label
                    className="mb-1 block text-sm font-medium"
                    htmlFor="mfa-phone-number"
                  >
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                    className="w-full p-2 border rounded"
                    required
                    id="mfa-phone-number"
                  />
                </div>
                <button type="submit" className="w-full btn-primary" disabled={sending}>
                  {sending ? 'Sending...' : 'Send Code'}
                </button>
              </form>
            )}
            {smsStep === 'verify' && (
              <form onSubmit={verifyCode} className="space-y-4">
                <div>
                  <label
                    className="mb-1 block text-sm font-medium"
                    htmlFor="mfa-sms-code"
                  >
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                    id="mfa-sms-code"
                  />
                </div>
                <button type="submit" className="w-full btn-primary" disabled={verifying}>
                  {verifying ? 'Verifying...' : 'Verify'}
                </button>
              </form>
            )}
            {smsStep === 'done' && (
              <p className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                Text message verification set up successfully.
              </p>
            )}
            <div id="recaptcha-container" />
          </div>
        )}
        {activeMethod === 'authenticator' && (
          <div className="space-y-4">
            {totpStep === 'initial' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Generate a QR code to connect your authenticator app. Each time you generate a code a new secret is created.
                </p>
                <button
                  type="button"
                  className="w-full btn-primary"
                  onClick={startTotpEnrollment}
                  disabled={totpLoading}
                >
                  {totpLoading ? 'Generating...' : 'Generate QR Code'}
                </button>
              </div>
            )}
            {totpStep === 'verify' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3">
                  {qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl}
                      alt="Authenticator app QR code"
                      className="h-40 w-40 rounded border border-gray-200 bg-white p-2 dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-bg)]"
                    />
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">Preparing QR code…</p>
                  )}
                  {totpSecret && (
                    <div className="w-full rounded-md bg-gray-100 p-3 text-xs text-gray-700 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                      Can't scan the code? Enter this key manually:
                      <div className="mt-1 select-all font-mono break-all">{totpSecret.secretKey}</div>
                    </div>
                  )}
                </div>
                <form onSubmit={verifyTotpCode} className="space-y-3">
                  <label
                    className="mb-1 block text-sm font-medium"
                    htmlFor="mfa-auth-code"
                  >
                    Authenticator Code
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    id="mfa-auth-code"
                  />
                  <div className="flex items-center gap-3">
                    <button type="submit" className="flex-1 btn-primary" disabled={totpLoading}>
                      {totpLoading ? 'Verifying...' : 'Verify'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      onClick={startTotpEnrollment}
                      disabled={totpLoading}
                    >
                      Regenerate
                    </button>
                  </div>
                </form>
              </div>
            )}
            {totpStep === 'done' && (
              <p className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                Authenticator app set up successfully.
              </p>
            )}
          </div>
        )}
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-md bg-green-50 p-3 text-sm text-green-600 dark:bg-emerald-900/40 dark:text-emerald-200">
            {message}
          </p>
        )}
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
