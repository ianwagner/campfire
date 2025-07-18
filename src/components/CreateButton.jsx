import React from 'react';
import { FiPlus } from 'react-icons/fi';
import IconButton from './IconButton.jsx';

const CreateButton = ({ ariaLabel = 'Create', ...props }) => (
  <IconButton aria-label={ariaLabel} {...props}>
    <FiPlus />
  </IconButton>
);

export default CreateButton;
