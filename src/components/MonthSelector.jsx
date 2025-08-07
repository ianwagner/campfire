import React from 'react';
import getMonthString from '../utils/getMonthString.js';

const MonthSelector = ({
  value,
  onChange,
  showButton = true,
  className = '',
  inputClassName = '',
}) => {
  const setThisMonth = () => {
    onChange(getMonthString());
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border px-2 py-1 rounded ${inputClassName}`}
      />
      {showButton && (
        <button
          type="button"
          onClick={setThisMonth}
          className="btn-secondary px-2 py-1"
        >
          This Month
        </button>
      )}
    </div>
  );
};

export default MonthSelector;
