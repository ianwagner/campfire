import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  RecaptchaVerifier,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  multiFactor,
  sendEmailVerification,
  signOut,
  type MultiFactorInfo,
  type TotpSecret,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase/config';
import { useNavigate } from 'react-router-dom';

interface ManageMfaProps {
  user: User | null;
  role: string;
}

/** MFA management and enrollment screen. Supports SMS- and TOTP-based MFA. */
const ManageMfa: React.FC<ManageMfaProps> = ({ user, role }) => {
  const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [smsCode, setSmsCode] = useState<string>('');
  const [verificationId, setVerificationId] = useState<string>('');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'enter' | 'verify'>(
    'idle'
  );
  const [sending, setSending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpCode, setTotpCode] = useState<string>('');
  const [totpDeviceName, setTotpDeviceName] = useState<string>('');
  const [totpLoading, setTotpLoading] = useState<boolean>(false);
  const [totpStep, setTotpStep] = useState<'idle' | 'verify'>('idle');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [signInPreference, setSignInPreference] = useState<string>('');
  const navigate = useNavigate();
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const activeUser = auth.currentUser ?? user ?? null;

  const totpFactorId = TotpMultiFactorGenerator.FACTOR_ID ?? 'totp';

  const preferenceStorageKey = useMemo(() => {
    if (!activeUser?.uid || typeof window === 'undefined') return '';
    return `campfire:mfaPreference:${activeUser.uid}`;
  }, [activeUser?.uid]);

  useEffect(() => {
    if (!user) {
      setFactors([]);
      return;
    }
    try {
      setFactors([...multiFactor(user).enrolledFactors]);
    } catch {
      setFactors([]);
    }
  }, [user]);

  useEffect(() => {
    if (!preferenceStorageKey) {
      setSignInPreference('');
      return;
    }
    try {
      const stored = window.localStorage.getItem(preferenceStorageKey);
      setSignInPreference(stored ?? '');
    } catch {
      setSignInPreference('');
    }
  }, [preferenceStorageKey]);

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch (err) {
          console.warn('Failed to clear reCAPTCHA verifier', err);
        }
        recaptchaRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!preferenceStorageKey) return;
    try {
      if (signInPreference) {
        window.localStorage.setItem(preferenceStorageKey, signInPreference);
      } else {
        window.localStorage.removeItem(preferenceStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [preferenceStorageKey, signInPreference]);

  const refreshFactors = async () => {
    const current = auth.currentUser ?? user;
    if (!current) return;
    try {
      if (typeof current.reload === 'function') {
        await current.reload();
      }
    } catch (err) {
      console.error('Failed to reload user for MFA factors', err);
    }
    try {
      setFactors([...multiFactor(current).enrolledFactors]);
    } catch (err) {
      console.error('Failed to read MFA factors', err);
      setFactors([]);
    }
  };

  const totpFactors = useMemo(
    () => factors.filter((factor) => factor.factorId === totpFactorId),
    [factors, totpFactorId]
  );

  const phoneFactors = useMemo(
    () => factors.filter((factor) => factor.factorId === 'phone'),
    [factors]
  );

  const disableMfa = async () => {
    if (!activeUser || factors.length === 0) return;
    if (
      !window.confirm(
        'Turning off MFA makes your account more vulnerable. Are you sure you want to continue?'
      )
    )
      return;
    try {
      const factor = factors[0];
      await multiFactor(activeUser).unenroll(factor);
      setMessage('MFA disabled');
      await refreshFactors();
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage('Please sign in again to manage MFA settings.');
        await signOut(auth);
        navigate('/login');
      } else {
        setError(err.message);
      }
    }
  };

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    return '+' + digits;
  };

  const maskPhoneNumber = (value?: string | null) => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return value;
    const lastTwo = digits.slice(-2);
    const country = digits.slice(0, 1);
    return `+${country}••• ••${lastTwo}`;
  };

  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current;
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
    });
    recaptchaRef.current = verifier;
    return verifier;
  };

  if (
    !user ||
    ![
      'admin',
      'client',
      'agency',
      'designer',
      'manager',
      'project-manager',
      'ops',
      'editor',
    ].includes(role)
  ) {
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

  const startTotpEnrollment = async () => {
    if (!user) return;
    setError('');
    setMessage('');
    setTotpLoading(true);
    try {
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
      setTotpStep('verify');
      setTotpCode('');
      setTotpDeviceName('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage('Please sign in again to manage MFA settings.');
        await signOut(auth);
        navigate('/login');
      } else {
        setError(err.message);
      }
    } finally {
      setTotpLoading(false);
    }
  };

  const cancelTotpEnrollment = () => {
    setTotpSecret(null);
    setTotpStep('idle');
    setTotpCode('');
    setTotpDeviceName('');
  };

  const completeTotpEnrollment = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !totpSecret) return;
    setError('');
    setMessage('');
    setTotpLoading(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        totpCode
      );
      const displayName = totpDeviceName.trim() || 'Authenticator App';
      await multiFactor(user).enroll(assertion, displayName);
      setMessage('Authenticator app enrolled successfully.');
      cancelTotpEnrollment();
      await refreshFactors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTotpLoading(false);
    }
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSending(true);
    try {
      if (!user) return;
      const mfaSession = await multiFactor(user).getSession();
      const phoneProvider = new PhoneAuthProvider(auth);
      const phoneOptions = {
        phoneNumber: formatPhoneNumber(phoneNumber),
        session: mfaSession,
      };
      const verifier = ensureRecaptcha();
      const id = await phoneProvider.verifyPhoneNumber(phoneOptions, verifier);
      setVerificationId(id);
      setPhoneStep('verify');
      setMessage('Verification code sent.');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage('Please sign in again to manage MFA settings.');
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
      if (!user) return;
      const cred = PhoneAuthProvider.credential(verificationId, smsCode);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, 'Phone');
      setMessage('Phone number enrolled successfully.');
      setPhoneStep('idle');
      setPhoneNumber('');
      setVerificationId('');
      setSmsCode('');
      await refreshFactors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const removeFactor = async (factor: MultiFactorInfo) => {
    if (!user) return;
    if (
      !window.confirm(
        'Removing this factor will make your account less secure. Continue?'
      )
    ) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await multiFactor(user).unenroll(factor);
      await refreshFactors();
      if (factor.factorId === totpFactorId) {
        setMessage('Authenticator app removed.');
      } else {
        setMessage('Phone number removed.');
      }
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage('Please sign in again to manage MFA settings.');
        await signOut(auth);
        navigate('/login');
      } else {
        setError(err.message);
      }
    }
  };

  const totpStatusLabel = totpFactors.length
    ? `Enrolled (${totpFactors
        .map((factor) => factor.displayName || 'Authenticator App')
        .join(', ')})`
    : 'Not set up';

  const phoneStatusLabel = phoneFactors.length
    ? maskPhoneNumber((phoneFactors[0] as any).phoneNumber || '') || 'Enrolled'
    : 'Not set up';

  const totpQrCodeUrl = useMemo(() => {
    if (!totpSecret) return '';
    try {
      const accountName = user?.email ?? activeUser?.email ?? 'Campfire';
      return totpSecret.generateQrCodeUrl(accountName, 'Campfire');
    } catch {
      return '';
    }
  }, [totpSecret, user?.email, activeUser?.email]);

  const totpCodeLength = totpSecret?.codeLength ?? 6;
  const phoneInputId = 'mfa-phone-number';
  const smsCodeId = 'mfa-sms-code';
  const totpDeviceNameId = 'mfa-totp-device-name';
  const totpCodeId = 'mfa-totp-code';

  return (
    <div className="flex justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Multi-Factor Authentication</h1>
          <p className="mt-2 text-sm text-gray-600">
            Add an extra layer of security to your account by requiring a code when you sign in.
          </p>
          {factors.length > 0 && user?.metadata.lastLoginAt && (
            <p className="mt-1 text-xs text-gray-500">
              Last MFA login:{' '}
              {new Date(Number(user.metadata.lastLoginAt)).toLocaleString()}
            </p>
          )}
        </div>

        {(error || message) && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {error || message}
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Authenticator App (TOTP)</h2>
              <p className="text-sm text-gray-600">
                Use an authenticator app (like Google Authenticator, 1Password, or Authy) to generate verification codes.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Status: {totpStatusLabel}
            </span>
          </div>

          {totpFactors.length > 0 && (
            <ul className="mt-4 space-y-3 text-sm text-gray-700">
              {totpFactors.map((factor) => (
                <li
                  key={factor.uid}
                  className="flex flex-col gap-1 rounded-md border border-gray-100 bg-gray-50 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {factor.displayName || 'Authenticator App'}
                    </p>
                    {factor.enrollmentTime && (
                      <p className="text-xs text-gray-500">
                        Added {new Date(factor.enrollmentTime).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary self-start md:self-auto"
                    onClick={() => removeFactor(factor)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {totpStep === 'idle' && totpFactors.length === 0 && (
            <div className="mt-6">
              <button
                type="button"
                className="btn-primary"
                onClick={startTotpEnrollment}
                disabled={totpLoading}
              >
                {totpLoading ? 'Preparing…' : 'Set up'}
              </button>
            </div>
          )}

          {totpStep === 'verify' && totpSecret && (
            <div className="mt-6 space-y-4 rounded-md border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-gray-700">
              <p className="font-medium">
                Scan this QR code with your authenticator app or enter the setup key manually.
              </p>
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                {totpQrCodeUrl ? (
                  <img
                    src={totpQrCodeUrl}
                    alt="Authenticator app QR code"
                    className="h-40 w-40 rounded-md border border-white shadow"
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded-md border border-dashed border-gray-400 bg-white text-center text-xs text-gray-500">
                    QR code unavailable
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase text-gray-500">Setup key</p>
                    <code className="mt-1 inline-block rounded bg-white px-2 py-1 text-sm font-semibold tracking-wider text-gray-800 shadow">
                      {totpSecret.secretKey}
                    </code>
                  </div>
                  <p className="text-xs text-gray-500">
                    Codes refresh every {totpSecret.codeIntervalSeconds} seconds and are {totpCodeLength}-digits long.
                  </p>
                  <p className="text-xs text-gray-500">
                    Complete enrollment before{' '}
                    {new Date(
                      totpSecret.enrollmentCompletionDeadline
                    ).toLocaleString()}
                    .
                  </p>
                </div>
              </div>

              <form onSubmit={completeTotpEnrollment} className="space-y-3">
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase text-gray-600"
                    htmlFor={totpDeviceNameId}
                  >
                    Authenticator device name (optional)
                  </label>
                  <input
                    type="text"
                    value={totpDeviceName}
                    onChange={(event) => setTotpDeviceName(event.target.value)}
                    id={totpDeviceNameId}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="e.g. Personal phone"
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase text-gray-600"
                    htmlFor={totpCodeId}
                  >
                    6-digit verification code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={totpCode}
                    onChange={(event) =>
                      setTotpCode(
                        event.target.value.replace(/\D/g, '').slice(0, totpCodeLength)
                      )
                    }
                    id={totpCodeId}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    required
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={totpLoading || totpCode.length !== totpCodeLength}
                  >
                    {totpLoading ? 'Verifying…' : 'Verify & Enroll'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={cancelTotpEnrollment}
                    disabled={totpLoading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Phone (SMS)</h2>
              <p className="text-sm text-gray-600">
                Receive verification codes by text message.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Status: {phoneStatusLabel}
            </span>
          </div>

          {phoneFactors.length > 0 && (
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              {phoneFactors.map((factor) => (
                <div
                  key={factor.uid}
                  className="flex flex-col gap-1 rounded-md border border-gray-100 bg-gray-50 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {maskPhoneNumber((factor as any).phoneNumber) || 'SMS'}
                    </p>
                    {factor.enrollmentTime && (
                      <p className="text-xs text-gray-500">
                        Added {new Date(factor.enrollmentTime).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary self-start md:self-auto"
                    onClick={() => removeFactor(factor)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {phoneStep === 'idle' && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPhoneStep('enter');
                  setPhoneNumber('');
                  setSmsCode('');
                  setVerificationId('');
                  setError('');
                  setMessage('');
                }}
              >
                {phoneFactors.length ? 'Change number' : 'Add number'}
              </button>
              {factors.length > 0 && (
                <button type="button" className="btn-secondary" onClick={disableMfa}>
                  Disable all MFA
                </button>
              )}
            </div>
          )}

          {phoneStep === 'enter' && (
            <form onSubmit={sendCode} className="mt-6 space-y-4 rounded-md border border-gray-100 bg-gray-50 p-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase text-gray-600"
                  htmlFor={phoneInputId}
                >
                  Phone number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  id={phoneInputId}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="+15555555555"
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send code'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPhoneStep('idle');
                    setPhoneNumber('');
                    setSmsCode('');
                    setVerificationId('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {phoneStep === 'verify' && (
            <form onSubmit={verifyCode} className="mt-6 space-y-4 rounded-md border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">
                Enter the 6-digit code we sent to {phoneNumber}.
              </p>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase text-gray-600"
                  htmlFor={smsCodeId}
                >
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  id={smsCodeId}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  maxLength={6}
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={verifying}>
                  {verifying ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPhoneStep('enter');
                    setVerificationId('');
                    setSmsCode('');
                  }}
                  disabled={verifying}
                >
                  Start over
                </button>
              </div>
            </form>
          )}
        </section>

        {factors.length > 1 && (
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Sign-in preference</h2>
            <p className="mt-1 text-sm text-gray-600">
              Choose which factor you prefer to use first when signing in. You can always switch during authentication.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">
                Default prompt
              </label>
              <select
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={signInPreference}
                onChange={(event) => setSignInPreference(event.target.value)}
              >
                <option value="">No preference</option>
                {factors.map((factor) => (
                  <option key={factor.uid} value={factor.uid}>
                    {factor.factorId === totpFactorId
                      ? factor.displayName || 'Authenticator App'
                      : maskPhoneNumber((factor as any).phoneNumber) || 'SMS'}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        <div id="recaptcha-container" />
      </div>
    </div>
  );
};

export default ManageMfa;
