import React from 'react';
import StatusBadge from './StatusBadge.jsx';

const FeedbackPanel = ({ entries = [] }) => {
  return (
    <aside className="w-full md:w-60 md:ml-4 mt-4 md:mt-0 max-h-[70vh] overflow-y-auto">
      <h3 className="font-semibold mb-2">Feedback</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No feedback yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className="border-b pb-1 last:border-none text-sm">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium">{e.updatedBy}</span>
                  {e.updatedAt && (
                    <span className="text-xs text-gray-500">
                      {e.updatedAt.toDate
                        ? e.updatedAt.toDate().toLocaleString()
                        : new Date(e.updatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <StatusBadge status={e.status} className="mt-1" />
                {e.comment && <p className="italic">{e.comment}</p>}
                {e.copyEdit && <p className="italic">Copy edit: {e.copyEdit}</p>}
              </li>
            ))}
        </ul>
      )}
    </aside>
  );
};

export default FeedbackPanel;
