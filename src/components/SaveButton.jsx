import React from 'react';
import { FiSave, FiCheck } from 'react-icons/fi';
import IconButton from './IconButton.jsx';

/**
 * SaveButton displays a disk icon with accent styling when changes can be saved
 * and a check mark when all changes have been saved. It shows a spinner while
 * the save action is in progress.
 *
 * @param {Object} props
 * @param {boolean} [props.canSave=false] Whether there are changes to save.
 * @param {boolean} [props.loading=false] Whether a save action is ongoing.
 */
const SaveButton = ({ canSave = false, loading = false, ...rest }) => (
  <IconButton
    aria-label={canSave ? 'Save' : 'Saved'}
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
    ) : canSave ? (
      <FiSave />
    ) : (
      <FiCheck />
    )}
  </IconButton>
);

export default SaveButton;
