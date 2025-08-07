import React from 'react';

const MonthSelector = ({ value, onChange }) => (
  <div className="flex items-center space-x-2 mb-4">
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border px-2 py-1 rounded"
    />
  </div>
);

export default MonthSelector;
