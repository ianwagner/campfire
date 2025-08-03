import React, { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import ErrorMessages from './components/ErrorMessages';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ENABLE_PLAN_STEP = false;
const ENABLE_BILLING_STEP = false;

const STEP_CONFIG = [
  { id: 1, label: 'Account', enabled: true },
  { id: 2, label: 'Plan', enabled: ENABLE_PLAN_STEP },
  { id: 3, label: 'Billing', enabled: ENABLE_BILLING_STEP },
  { id: 4, label: 'Confirm', enabled: ENABLE_PLAN_STEP || ENABLE_BILLING_STEP },
];

const SignUpStepper: React.FC = () => {
  const steps = STEP_CONFIG.filter((s) => s.enabled);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submitAccount = async (e: FormEvent) => {
    e.preventDefault();
    const msgs: string[] = [];
    if (!companyName.trim()) msgs.push('Company name is required');
    if (!fullName.trim()) msgs.push('Full name is required');
    if (!emailRegex.test(email)) msgs.push('Valid email is required');
    if (!password) msgs.push('Password is required');
    if (msgs.length) {
      setErrors(msgs);
      return;
    }
    setErrors([]);
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        companyName: companyName.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        plan: 'free',
        isPaid: false,
        credits: 10,
        stripeCustomerId: null,
      });
      await sendEmailVerification(cred.user);
      if (stepIndex < steps.length - 1) {
        setStepIndex(stepIndex + 1);
      } else {
        navigate('/mfa-settings');
      }
    } catch (err: any) {
      const msg = (err?.message || '').replace('Firebase:', '').replace(/\(auth.*\)/, '').trim();
      setErrors([msg]);
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => setStepIndex(stepIndex + 1);

  return (
    <div className="flex justify-center p-4">
      <div className="w-80">
        {currentStep.id === 1 && (
          <form onSubmit={submitAccount} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
            </div>
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
        {currentStep.id === 2 && (
          <div className="space-y-4">
            <p>Plan selection coming soon</p>
            <button type="button" className="w-full btn-primary" onClick={goNext}>
              Next
            </button>
          </div>
        )}
        {currentStep.id === 3 && (
          <div className="space-y-4">
            <p>Billing setup coming soon</p>
            <button type="button" className="w-full btn-primary" onClick={goNext}>
              Next
            </button>
          </div>
        )}
        {currentStep.id === 4 && <p>Account created!</p>}
      </div>
    </div>
  );
};

export default SignUpStepper;
