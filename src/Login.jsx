import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  getMultiFactorResolver,
  RecaptchaVerifier,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import debugLog from './utils/debugLog';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mfaResolver, setMfaResolver] = useState(null);
  const [verificationId, setVerificationId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    debugLog('Signing in', email);
    setError('');
    setShowReset(false);
    setResetSent(false);
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      debugLog('Sign-in successful');
      if (onLogin) onLogin();
    } catch (err) {
      if (err.code === 'auth/multi-factor-auth-required') {
        try {
          const resolver = getMultiFactorResolver(auth, err);
          const phoneInfoOptions = {
            multiFactorHint: resolver.hints[0],
            session: resolver.session,
          };
          const verifier = new RecaptchaVerifier(
            auth,
            'recaptcha-container',
            { size: 'invisible' }
          );
          const provider = new PhoneAuthProvider(auth);
          const id = await provider.verifyPhoneNumber(phoneInfoOptions, verifier);
          setVerificationId(id);
          setMfaResolver(resolver);
        } catch (mfaErr) {
          setError(mfaErr.message);
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
    debugLog('Verifying MFA code');
    setError('');
    setVerifying(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId, mfaCode);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
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

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-gray-100 dark:bg-[var(--dark-bg)]">
      {/* Campfire logo removed per request */}
      <div className="mb-4 text-xl font-semibold">CAMPFIRE</div>
      {!mfaResolver ? (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[var(--dark-sidebar-bg)] p-6 rounded shadow-md w-80">
          <h1 className="text-2xl mb-4 text-center">Login</h1>
          <label className="block mb-2 text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            required
          />
          <label className="block mb-2 text-sm font-medium">Password</label>
          <input
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
          <div id="recaptcha-container"></div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="bg-white dark:bg-[var(--dark-sidebar-bg)] p-6 rounded shadow-md w-80">
          <h1 className="text-2xl mb-4 text-center">Verify Code</h1>
          <label className="block mb-2 text-sm font-medium">SMS Code</label>
          <input
            type="text"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            required
          />
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <button type="submit" className="w-full btn-primary" disabled={verifying}>
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      )}
    </div>
  );
};

export default Login;
