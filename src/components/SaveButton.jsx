import React from 'react';
import { FiSave } from 'react-icons/fi';
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
  return (
    <IconButton
      aria-label="Save"
      disabled={!canSave || loading}
      className={`text-xl ${canSave ? 'bg-accent text-white' : ''}`}
      {...rest}
    >
      {loading ? <div className="loading-ring w-4 h-4" /> : <FiSave />}
    </IconButton>
  );
};

export default SaveButton;
