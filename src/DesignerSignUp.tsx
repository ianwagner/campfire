import React, { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import ErrorMessages from './components/ErrorMessages';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DesignerSignUp: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [accountCreated, setAccountCreated] = useState(false);
  const [createdEmail, setCreatedEmail] = useState('');
  const navigate = useNavigate();

  const handleMfaChoice = (method: 'totp' | 'sms') => {
    navigate('/mfa-settings', {
      state: { recommendedEnrollment: method, fromSignUp: true },
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);
    const msgs: string[] = [];
    if (!fullName.trim()) msgs.push('Full name is required');
    if (!emailRegex.test(email)) msgs.push('Valid email is required');
    if (!password) msgs.push('Password is required');
    if (msgs.length) {
      setErrors(msgs);
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        role: 'designer',
        audience: 'designer',
        fullName: fullName.trim(),
        email: email.trim(),
      });
      await sendEmailVerification(cred.user);
      setAccountCreated(true);
      setCreatedEmail(email.trim());
    } catch (err: any) {
      const msg = (err?.message || '').replace('Firebase:', '').replace(/\(auth.*\)/, '').trim();
      setErrors([msg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 flex justify-center">
      {accountCreated ? (
        <div className="w-80 space-y-4 text-center">
          <h2 className="text-2xl font-semibold">Secure your account</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            We sent a verification email to {createdEmail || 'your email address'}. Choose how you want to finish setting up multi-factor authentication.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              className="w-full btn-primary"
              onClick={() => handleMfaChoice('totp')}
            >
              Use an authenticator app
            </button>
            <button
              type="button"
              className="w-full btn-secondary"
              onClick={() => handleMfaChoice('sms')}
            >
              Use text message codes
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 w-80">
          <h1 className="text-2xl mb-2 text-center">Designer Sign Up</h1>
          <div>
            <label className="block mb-1 text-sm font-medium">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <ErrorMessages messages={errors} />
          <button type="submit" className="w-full btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      )}
    </div>
  );
};

export default DesignerSignUp;
