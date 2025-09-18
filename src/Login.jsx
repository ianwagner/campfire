import React, { useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  getMultiFactorResolver,
  RecaptchaVerifier,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import debugLog from './utils/debugLog';
import useSiteSettings from './useSiteSettings';
import { DEFAULT_LOGO_URL } from './constants';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mfaResolver, setMfaResolver] = useState(null);
  const [mfaHints, setMfaHints] = useState([]);
  const [selectedHintUid, setSelectedHintUid] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaCodeSent, setMfaCodeSent] = useState(false);
  const [mfaSending, setMfaSending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { settings } = useSiteSettings(false);
  const recaptchaVerifierRef = useRef(null);
  const selectedHint =
    mfaHints.find((hint) => hint?.uid === selectedHintUid) ?? null;

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch (err) {
          console.warn('Failed to clear reCAPTCHA verifier', err);
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const ensureRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current;
    }
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const getHintLabel = (hint) => {
    if (!hint) return 'Unknown method';
    if (hint.factorId === 'phone') {
      return hint.phoneNumber
        ? `Text message to ${hint.phoneNumber}`
        : 'Text message';
    }
    if (hint.factorId === 'totp') {
      const displayName = hint.displayName?.trim();
      if (displayName && displayName.toLowerCase() !== 'authenticator app') {
        return `Authenticator app (${displayName})`;
      }
      return 'Authenticator app';
    }
    return 'Unknown method';
  };

  const sendCodeForHint = async (resolver, hint) => {
    if (!hint || hint.factorId !== 'phone') return;
    setError('');
    setMfaSending(true);
    try {
      const phoneInfoOptions = {
        multiFactorHint: hint,
        session: resolver.session,
      };
      const verifier = ensureRecaptcha();
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber(phoneInfoOptions, verifier);
      setVerificationId(id);
      setMfaCode('');
      setMfaCodeSent(true);
    } catch (err) {
      setError(err.message);
      setMfaCodeSent(false);
      throw err;
    } finally {
      setMfaSending(false);
    }
  };

  const handleHintChange = async (event) => {
    const uid = event.target.value;
    if (!mfaResolver) return;
    setSelectedHintUid(uid);
    setError('');
    setMfaCode('');
    setVerificationId('');
    setMfaCodeSent(false);
    const hint = mfaHints.find((item) => item?.uid === uid);
    if (!hint) return;
    if (hint.factorId === 'phone') {
      try {
        await sendCodeForHint(mfaResolver, hint);
      } catch {
        // error already handled in sendCodeForHint
      }
    } else if (hint.factorId === 'totp') {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch (err) {
          console.warn('Failed to clear reCAPTCHA verifier', err);
        }
        recaptchaVerifierRef.current = null;
      }
    }
  };

  const handleSendCode = async () => {
    if (!mfaResolver || !selectedHint || selectedHint.factorId !== 'phone') {
      return;
    }
    try {
      await sendCodeForHint(mfaResolver, selectedHint);
    } catch {
      // error already reported by sendCodeForHint
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    debugLog('Signing in', email);
    setError('');
    setShowReset(false);
    setResetSent(false);
    setMfaResolver(null);
    setMfaHints([]);
    setSelectedHintUid('');
    setVerificationId('');
    setMfaCode('');
    setMfaCodeSent(false);
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      debugLog('Sign-in successful');
      if (onLogin) onLogin();
    } catch (err) {
      if (err.code === 'auth/multi-factor-auth-required') {
        try {
          const resolver = getMultiFactorResolver(auth, err);
          const hints = resolver?.hints ?? [];
          if (!hints.length) {
            throw new Error('No MFA factors available for this account.');
          }

          setMfaResolver(resolver);
          setMfaHints(hints);
          setVerificationId('');
          setMfaCode('');
          setMfaCodeSent(false);

          let storedPreference = '';
          try {
            if (typeof window !== 'undefined') {
              const emailKey = `campfire:mfaPreference:email:${email
                .trim()
                .toLowerCase()}`;
              storedPreference = window.localStorage.getItem(emailKey) ?? '';
              if (!storedPreference) {
                for (let i = 0; i < window.localStorage.length; i += 1) {
                  const key = window.localStorage.key(i);
                  if (key && key.startsWith('campfire:mfaPreference:')) {
                    const value = window.localStorage.getItem(key);
                    if (value && hints.some((hint) => hint.uid === value)) {
                      storedPreference = value;
                      break;
                    }
                  }
                }
              }
            }
          } catch {
            storedPreference = '';
          }

          const preferredHint =
            hints.find((hint) => hint.uid === storedPreference) ?? null;
          const defaultHint = preferredHint ?? hints[0];
          setSelectedHintUid(defaultHint?.uid ?? '');

          if (defaultHint?.factorId === 'phone') {
            try {
              await sendCodeForHint(resolver, defaultHint);
            } catch {
              // error already surfaced via setError
            }
          } else if (defaultHint?.factorId === 'totp') {
            if (recaptchaVerifierRef.current) {
              try {
                recaptchaVerifierRef.current.clear();
              } catch (clearErr) {
                console.warn('Failed to clear reCAPTCHA verifier', clearErr);
              }
              recaptchaVerifierRef.current = null;
            }
          }
        } catch (mfaErr) {
          setError(mfaErr.message || 'Additional verification required.');
        }
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password');
        setShowReset(true);
      } else {
        setError(err.message);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!mfaResolver) return;
    if (!selectedHint) {
      setError('Select a verification method.');
      return;
    }
    debugLog('Verifying MFA code');
    setError('');
    setVerifying(true);
    try {
      let assertion;
      if (selectedHint.factorId === 'phone') {
        if (!verificationId) {
          throw new Error('Send a verification code before verifying.');
        }
        const cred = PhoneAuthProvider.credential(verificationId, mfaCode);
        assertion = PhoneMultiFactorGenerator.assertion(cred);
      } else if (selectedHint.factorId === 'totp') {
        assertion = TotpMultiFactorGenerator.assertionForSignIn(
          selectedHint.uid,
          mfaCode
        );
      } else {
        throw new Error('Unsupported verification method.');
      }
      await mfaResolver.resolveSignIn(assertion);
      debugLog('MFA sign-in successful');
      if (onLogin) onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = async () => {
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const logoSrc = settings.campfireLogoUrl || settings.logoUrl || DEFAULT_LOGO_URL;

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-gray-100 dark:bg-[var(--dark-bg)]">
      {logoSrc ? (
        <OptimizedImage
          pngUrl={logoSrc}
          alt="Campfire logo"
          loading="eager"
          cacheKey={logoSrc}
          className="mb-4 max-h-16 w-auto"
        />
      ) : (
        <div className="mb-4 text-xl font-semibold">CAMPFIRE</div>
      )}
      {!mfaResolver ? (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[var(--dark-sidebar-bg)] p-6 rounded shadow-md w-80">
          <h1 className="text-2xl mb-4 text-center">Login</h1>
          <label className="block mb-2 text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            required
          />
          <label className="block mb-2 text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            required
          />
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          {resetSent && (
            <p className="text-green-500 text-sm mb-2">Password reset email sent.</p>
          )}
          <button type="submit" className="w-full btn-primary" disabled={signingIn}>
            {signingIn ? 'Signing In...' : 'Sign In'}
          </button>
          {showReset && !resetSent && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full mt-2 text-sm text-center text-blue-500"
            >
              Forgot password?
            </button>
          )}
        </form>
      ) : (
        <form onSubmit={handleVerify} className="bg-white dark:bg-[var(--dark-sidebar-bg)] p-6 rounded shadow-md w-80 space-y-4">
          <div>
            <h1 className="text-2xl text-center">Verify your identity</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 text-center">
              Complete multi-factor authentication to finish signing in.
            </p>
          </div>

          <div>
            <label htmlFor="mfa-method" className="block mb-1 text-sm font-medium">
              Verification method
            </label>
            <select
              id="mfa-method"
              className="w-full p-2 border rounded"
              value={selectedHintUid}
              onChange={handleHintChange}
            >
              {mfaHints.map((hint) => (
                <option key={hint.uid} value={hint.uid}>
                  {getHintLabel(hint)}
                </option>
              ))}
            </select>
          </div>

          {selectedHint?.factorId === 'totp' ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                Enter the code from your authenticator app.
              </p>
              <label htmlFor="totp-code" className="block mb-1 text-sm font-medium">
                Authenticator app code
              </label>
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full p-2 border rounded"
                required
              />
            </div>
          ) : selectedHint?.factorId === 'phone' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {mfaCodeSent
                  ? `Enter the code we sent to ${selectedHint.phoneNumber || 'your phone'}.`
                  : `Send a verification code to ${selectedHint.phoneNumber || 'your phone'}.`}
              </p>
              <button
                type="button"
                className="w-full btn-secondary"
                onClick={handleSendCode}
                disabled={mfaSending}
              >
                {mfaSending ? 'Sending…' : mfaCodeSent ? 'Resend code' : 'Send code'}
              </button>
              {mfaCodeSent && (
                <div>
                  <label htmlFor="sms-code" className="block mb-1 text-sm font-medium">
                    SMS code
                  </label>
                  <input
                    id="sms-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={mfaCode}
                    onChange={(e) =>
                      setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full p-2 border rounded"
                    maxLength={6}
                    required
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Select a verification method to continue.
            </p>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full btn-primary"
            disabled={
              verifying ||
              (selectedHint?.factorId === 'phone' && (!mfaCodeSent || !verificationId))
            }
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      )}
      <div id="recaptcha-container" className="hidden" />
    </div>
  );
};

export default Login;
