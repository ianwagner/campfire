import React from 'react';
import getMonthString from '../utils/getMonthString.js';

const MonthSelector = ({ value, onChange }) => {
  const setThisMonth = () => {
    onChange(getMonthString());
  };

  return (
    <div className="flex items-center space-x-2 mb-4">
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border px-2 py-1 rounded"
      />
      <button
        type="button"
        onClick={setThisMonth}
        className="btn-secondary px-2 py-1"
      >
        This Month
      </button>
    </div>
  );
};

export default MonthSelector;
