import React from 'react';
import { FiPlus } from 'react-icons/fi';
import IconButton from './IconButton.jsx';

const CreateButton = ({ ariaLabel = 'Create', children, ...props }) => (
  <IconButton aria-label={ariaLabel} {...props}>
    <FiPlus />
    {children}
  </IconButton>
);

export default CreateButton;
