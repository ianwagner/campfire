import React from 'react';
import TabButton from './TabButton.jsx';
import formatMonthLabel from '../utils/formatMonthLabel.js';

const MonthToggleSelector = ({ months = [], selected = '', onSelect }) => (
  <div className="flex flex-wrap gap-2 mb-4">
    {months.map((m) => (
      <TabButton
        key={m}
        type="button"
        active={selected === m}
        onClick={() => onSelect(m)}
      >
        {formatMonthLabel(m)}
      </TabButton>
    ))}
  </div>
);

export default MonthToggleSelector;

