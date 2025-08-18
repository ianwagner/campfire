import React from 'react';
import useSiteSettings from '../useSiteSettings';
import { hexToRgba } from '../utils/theme.js';

const MonthTag = ({ month, className = '' }) => {
  const { settings, loading } = useSiteSettings();
  const monthColors = loading ? {} : settings.monthColors || {};
  const tagStrokeWeight = settings.tagStrokeWeight ?? 1;
  if (!month) return null;
  const monthLabel = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(-2)) - 1,
    1
  ).toLocaleString('default', { month: 'short' });
  const entry = monthColors[month.slice(-2)] || null;
  const color = typeof entry === 'string' ? entry : entry?.color;
  const opacity = entry && typeof entry === 'object' ? entry.opacity : 1;
  const textColor = entry && typeof entry === 'object' ? entry.textColor : '#000000';
  const bgColor =
    color && opacity < 1 && color.startsWith('#')
      ? hexToRgba(color, opacity)
      : color;
  return (
    <span
      className={`tag-pill px-2 py-0.5 text-xs ${className}`.trim()}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        borderColor: textColor,
        borderWidth: tagStrokeWeight,
        borderStyle: 'solid',
      }}
    >
      {monthLabel}
    </span>
  );
};

export default MonthTag;
