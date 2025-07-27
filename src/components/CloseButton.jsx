import React from 'react';
import { FiX } from 'react-icons/fi';
import IconButton from './IconButton.jsx';

/**
 * CloseButton shows an "X" icon for dismissing modals or dialogs.
 * It forwards all props to the underlying IconButton.
 */
const CloseButton = (props) => (
  <IconButton aria-label="Close" {...props}>
    <FiX />
  </IconButton>
);

export default CloseButton;
