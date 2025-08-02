import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { FiCheckCircle, FiX } from 'react-icons/fi';
import InfoTooltip from './InfoTooltip.jsx';

const UrlCheckInput = ({ value, onChange, onRemove, errorMessage = 'We can’t access this link. Please make sure it’s set to “anyone can view” or the folder may be empty.', inputClass = '', className = '', ...props }) => {
  const [status, setStatus] = useState(null);

  const verify = async () => {
    if (!value) return;
    setStatus('loading');
    try {
      const callable = httpsCallable(functions, 'verifyDriveAccess', { timeout: 60000 });
      await callable({ url: value });
      setStatus(true);
    } catch (err) {
      setStatus(false);
    }
  };

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setStatus(null);
        }}
        onBlur={verify}
        className={`flex-1 border rounded ${status === false ? 'line-through' : ''} ${inputClass}`}
        {...props}
      />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <div className="w-5 h-5 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {status === true && <FiCheckCircle className="text-green-600" />}
      {status === false && (
        errorMessage ? (
          <InfoTooltip text={errorMessage} maxWidth={250}>
            <FiX className={`text-red-600${onRemove ? ' cursor-pointer' : ''}`} onClick={onRemove} />
          </InfoTooltip>
        ) : (
          <FiX className={`text-red-600${onRemove ? ' cursor-pointer' : ''}`} onClick={onRemove} />
        )
      )}
    </div>
  );
};

export default UrlCheckInput;
