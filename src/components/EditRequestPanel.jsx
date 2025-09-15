import React from 'react';
import diffWords from '../utils/diffWords';

const EditRequestPanel = ({ entries = [], className = '' }) => (
  <aside className={`w-full md:w-60 max-h-[70vh] overflow-y-auto dark:text-[var(--dark-text)] ${className}`}>
    <div className="rounded p-3 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
      <h3 className="font-semibold mb-2">Comments</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className="border-b pb-2 last:border-none text-sm">
                <p>
                  <span className="font-medium">{e.updatedBy}:</span> {e.comment || ''}
                </p>
                {e.updatedAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {e.updatedAt.toDate
                      ? e.updatedAt.toDate().toLocaleString()
                      : new Date(e.updatedAt).toLocaleString()}
                  </p>
                )}
                {e.copyEdit && (
                  <p className="mt-3 italic">
                    {(() => {
                      if (!e.origCopy) return e.copyEdit;
                      const diff = diffWords(e.origCopy, e.copyEdit);
                      return diff.map((part, idx) => {
                        const text = part.text ?? part.value ?? '';
                        const type = part.type ?? 'same';
                        const space = idx < diff.length - 1 ? ' ' : '';
                        if (type === 'same') return text + space;
                        if (type === 'removed')
                          return (
                            <span key={idx} className="text-red-600 line-through dark:text-red-400">
                              {text}
                              {space}
                            </span>
                          );
                        return (
                          <span key={idx} className="text-green-600 italic dark:text-green-400">
                            {text}
                            {space}
                          </span>
                        );
                      });
                    })()}
                  </p>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  </aside>
);

export default EditRequestPanel;

