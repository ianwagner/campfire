import React from 'react';
import getMonthString from '../utils/getMonthString.js';

const MonthSelector = ({
  value,
  onChange,
  showButton = true,
  className = '',
  inputClassName = '',
  buttonClassName = '',
  inputProps = {},
}) => {
  const setThisMonth = () => {
    onChange(getMonthString());
  };

  const { className: extraInputClassName = '', ...restInputProps } = inputProps || {};

  return (
    <div className={`flex items-center space-x-2 ${className}`.trim()}>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded border px-2 py-1 text-sm ${inputClassName} ${extraInputClassName}`.trim()}
        {...restInputProps}
      />
      {showButton && (
        <button
          type="button"
          onClick={setThisMonth}
          className={`btn-secondary px-2 py-1 ${buttonClassName}`.trim()}
        >
          This Month
        </button>
      )}
    </div>
  );
};

export default MonthSelector;
