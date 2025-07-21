import React, { useEffect, useRef, useState } from 'react';
import { FiCheck } from 'react-icons/fi';
import IconButton from './IconButton.jsx';

/**
 * LoadingIconButton displays a spinner while an action is in progress
 * and shows a check mark briefly once loading completes.
 *
 * @param {Object} props
 * @param {React.ComponentType} props.icon The icon to display when idle.
 * @param {boolean} [props.loading=false] Whether the action is running.
 */
const LoadingIconButton = ({ icon: Icon, loading = false, ...rest }) => {
  const [showCheck, setShowCheck] = useState(false);
  const prevLoading = useRef(false);

  useEffect(() => {
    if (prevLoading.current && !loading) {
      setShowCheck(true);
      const t = setTimeout(() => setShowCheck(false), 1000);
      return () => clearTimeout(t);
    }
    prevLoading.current = loading;
    return undefined;
  }, [loading]);

  return (
    <IconButton {...rest} disabled={rest.disabled || loading} className={`text-xl ${loading ? 'bg-accent-10' : ''} ${rest.className || ''}`.trim()}>
      {loading ? (
        <div className="loading-ring" style={{ width: '1em', height: '1em', borderWidth: '2px' }} />
      ) : showCheck ? (
        <FiCheck />
      ) : (
        Icon ? <Icon /> : null
      )}
    </IconButton>
  );
};

export default LoadingIconButton;
