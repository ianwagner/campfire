import React, { useEffect } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import useSiteSettings from '../useSiteSettings';
import getMonthString from '../utils/getMonthString.js';
import { hexToRgba } from '../utils/theme.js';

const DueDateMonthSelector = ({
  dueDate,
  setDueDate,
  month,
  setMonth,
  isAgency,
}) => {
  const { settings, loading: settingsLoading } = useSiteSettings();
  const monthColors = settingsLoading ? {} : settings.monthColors || {};
  const tagStrokeWeight = settings.tagStrokeWeight ?? 1;
  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return {
      value: getMonthString(d),
      label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
    };
  });

  const monthColorEntry = monthColors[month?.slice(-2)] || null;
  const monthColor = monthColorEntry?.color;
  const monthOpacity = monthColorEntry?.opacity ?? 1;
  const monthTextColor = monthColorEntry?.textColor || '#000000';
  const bgColor =
    monthColor && monthOpacity < 1 && monthColor.startsWith('#')
      ? hexToRgba(monthColor, monthOpacity)
      : monthColor;
  const monthLabel =
    month
      ? new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(-2)) - 1,
          1
        ).toLocaleString('default', { month: 'short' })
      : '';

  useEffect(() => {
    if (!month) {
      setMonth(getMonthString());
    }
  }, [month, setMonth]);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-col items-start">
        <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Due Date:</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="border tag-pill px-2 py-1 text-sm"
        />
      </div>
      {isAgency && (
        <div className="flex flex-col items-start">
          <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Month:</span>
          <div className="relative">
            <select
              aria-label="Month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="absolute inset-0 w-full h-full cursor-pointer appearance-none"
              style={{ opacity: 0, WebkitAppearance: 'none', MozAppearance: 'none' }}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <div
              className="pointer-events-none tag-pill px-2 py-0.5 pr-3 text-xs flex items-center"
              style={{
                backgroundColor: bgColor,
                color: monthTextColor,
                borderColor: monthTextColor,
                borderWidth: tagStrokeWeight,
                borderStyle: 'solid',
              }}
            >
              {monthLabel}
              <FiChevronDown className="ml-1" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DueDateMonthSelector;
