import React, { useState } from 'react';
import {
  RecaptchaVerifier,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
} from 'firebase/auth';
import { auth } from './firebase/config';

const EnrollMfa = ({ user, role }) => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [step, setStep] = useState('start');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!user || !['admin', 'client'].includes(role)) {
    return <p className="p-4">MFA enrollment not allowed for this account.</p>;
  }

  const sendCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const session = await multiFactor(user).getSession();
      const phoneInfoOptions = { phoneNumber: phone, session };
      const verifier = new RecaptchaVerifier(
        'mfa-recaptcha',
        { size: 'invisible' },
        auth
      );
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber(phoneInfoOptions, verifier);
      setVerificationId(id);
      setStep('verify');
    } catch (err) {
      setError(err.message);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const cred = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, 'phone');
      setMessage('Enrollment complete');
      setStep('done');
    } catch (err) {
      setError(err.message);
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" className="w-full btn-primary">
              Send Code
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
            <button type="submit" className="w-full btn-primary">
              Verify
            </button>
          </form>
        )}
        {message && <p className="text-green-600 mt-2 text-sm">{message}</p>}
        <div id="mfa-recaptcha"></div>
      </div>
    </div>
  );
};

export default EnrollMfa;
