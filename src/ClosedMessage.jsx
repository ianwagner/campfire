import React from 'react';
import BriefSummary from './BriefSummary.jsx';
import { formatDeliveryWindow, getClosedCopy } from './monthlyBriefCopy.js';

const ClosedMessage = ({
  type = 'brand',
  agencyName,
  deliveryWindowDays,
  submission,
  locale = 'en-US',
}) => {
  const copy = getClosedCopy(type, agencyName);
  const windowCopy = formatDeliveryWindow(deliveryWindowDays, { includeRolling: false });

  return (
    <div className="space-y-6">
      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 bg-gray-50 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-semibold mb-2">{copy.title}</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">{copy.body}</p>
        <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">{windowCopy}</p>
      </div>
      {submission && <BriefSummary submission={submission} locale={locale} />}
    </div>
  );
};

export default ClosedMessage;
