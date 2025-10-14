import React from 'react';
import { FiEdit3 } from 'react-icons/fi';
import BriefSummary from './BriefSummary.jsx';
import {
  formatDateTime,
  formatDeliveryWindow,
  getSubmittedMessage,
} from './monthlyBriefCopy.js';

const SubmittedEditable = ({
  submission,
  canEditUntil,
  deliveryWindowDays,
  onEdit,
  editing = false,
  children,
  locale = 'en-US',
}) => {
  const formattedDeadline = canEditUntil ? formatDateTime(canEditUntil, locale) : '';
  const headerCopy = getSubmittedMessage(formattedDeadline);
  const windowCopy = formatDeliveryWindow(deliveryWindowDays, { includeRolling: false });

  return (
    <div className="space-y-6">
      <div className="border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-900/30 rounded-2xl p-6 text-emerald-900 dark:text-emerald-100">
        <h2 className="text-xl font-semibold mb-2">{headerCopy}</h2>
        <p className="text-sm mb-2 text-emerald-800 dark:text-emerald-100/90">{windowCopy}</p>
        {!editing && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 mt-2 px-4 py-2 text-sm font-medium rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
          >
            <FiEdit3 /> Update brief
          </button>
        )}
      </div>

      <BriefSummary submission={submission} locale={locale} />

      {editing && children && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
};

export default SubmittedEditable;
