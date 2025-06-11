import React from 'react';
import { FiAlertCircle } from 'react-icons/fi';

interface Props {
  messages: string[];
}

const ErrorMessages: React.FC<Props> = ({ messages }) => {
  if (!messages || messages.length === 0) return null;
  return (
    <ul className="text-red-500 text-sm space-y-1" data-testid="error-list">
      {messages.map((msg, i) => (
        <li key={i} className="flex items-center">
          <FiAlertCircle className="mr-1" />
          <span>{msg}</span>
        </li>
      ))}
    </ul>
  );
};

export default ErrorMessages;
