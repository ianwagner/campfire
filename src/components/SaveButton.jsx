import React, { useEffect, useRef, useState } from 'react';
import { FiSave, FiCheck } from 'react-icons/fi';
import IconButton from './IconButton.jsx';

/**
 * SaveButton displays a disk icon with accent styling when changes can be saved.
 * It shows a spinner while the save action is in progress.
 *
 * @param {Object} props
 * @param {boolean} [props.canSave=false] Whether there are changes to save.
 * @param {boolean} [props.loading=false] Whether a save action is ongoing.
 */
const SaveButton = ({ canSave = false, loading = false, ...rest }) => {
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
    <IconButton
      aria-label="Save"
      disabled={!canSave || loading}
      className={`text-xl ${canSave ? 'bg-accent text-white' : ''} ${
        loading ? 'bg-accent-10' : ''
      }`}
      {...rest}
    >
      {loading ? (
        <div
          className="loading-ring"
          style={{ width: '1em', height: '1em', borderWidth: '2px' }}
        />
      ) : showCheck ? (
        <FiCheck />
      ) : (
        <FiSave />
      )}
    </IconButton>
  );
};

export default SaveButton;
