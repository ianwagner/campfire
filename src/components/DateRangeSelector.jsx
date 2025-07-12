import React from 'react';

const DateRangeSelector = ({ startDate, endDate, onChange }) => {
  return (
    <div className="flex items-center space-x-2 mb-4">
      <input
        type="month"
        value={startDate}
        onChange={(e) => onChange({ start: e.target.value, end: endDate })}
        className="border px-2 py-1 rounded"
      />
      <span>-</span>
      <input
        type="month"
        value={endDate}
        onChange={(e) => onChange({ start: startDate, end: e.target.value })}
        className="border px-2 py-1 rounded"
      />
    </div>
  );
};

export default DateRangeSelector;
