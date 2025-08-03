import React, { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import ErrorMessages from './components/ErrorMessages';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SignUpStepper: React.FC = () => {
  const [step, setStep] = useState<1 | 2>(1);
  const [businessType, setBusinessType] = useState('agency');
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const nextStep = (e: FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setErrors(['Company name is required']);
      return;
    }
    setErrors([]);
    setStep(2);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const msgs: string[] = [];
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
      let agencyId: string | undefined;
      if (businessType === 'agency') {
        const agencyRef = await addDoc(collection(db, 'agencies'), {
          name: companyName.trim(),
          themeColor: DEFAULT_ACCENT_COLOR,
          logoUrl: '',
        });
        agencyId = agencyRef.id;
      }
      await setDoc(doc(db, 'users', cred.user.uid), {
        role: businessType,
        audience: businessType,
        companyName: companyName.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        ...(agencyId ? { agencyId } : {}),
        plan: 'free',
        isPaid: false,
        credits: 10,
        stripeCustomerId: null,
      });
      await sendEmailVerification(cred.user);
      navigate('/mfa-settings');
    } catch (err: any) {
      const msg = (err?.message || '').replace('Firebase:', '').replace(/\(auth.*\)/, '').trim();
      setErrors([msg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center p-4">
      <div className="w-80">
        {step === 1 && (
          <form onSubmit={nextStep} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Business Type</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="agency">Agency</option>
                <option value="client">Brand</option>
              </select>
            </div>
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
            <ErrorMessages messages={errors} />
            <button type="submit" className="w-full btn-primary">
              Next
            </button>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={submit} className="space-y-4">
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
    </div>
  );
};

export default SignUpStepper;
