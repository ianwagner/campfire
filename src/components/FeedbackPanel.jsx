import React, { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import diffWords from '../utils/diffWords';

const FeedbackPanel = ({
  entries = [],
  className = '',
  onVersionClick,
  origCopy = '',
  collapsible = false,
}) => {
  const [expanded, setExpanded] = useState(!collapsible);

  const isGrouped =
    !Array.isArray(entries) && entries && typeof entries === 'object';
  const versions = isGrouped
    ? Object.keys(entries).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    : [];
  const lists = isGrouped ? entries : { 1: Array.isArray(entries) ? entries : [] };
  const hasMultiple = isGrouped && versions.length > 1;

  const allEmpty = versions.length
    ? versions.every((v) => (lists[v] || []).length === 0)
    : (lists[1] || []).length === 0;

  const latestVersion = versions.length ? versions[versions.length - 1] : 1;
  const latestList = lists[latestVersion] || [];
  const latestEntry = latestList[latestList.length - 1];

  const renderList = (list) => (
    <ul className="space-y-2">
      {list
        .slice()
        .reverse()
        .map((e) => (
          <li key={e.id} className="border-b pb-1 last:border-none text-sm">
            <div className="flex justify-between items-baseline">
              <span className="font-medium">{e.updatedBy}</span>
              {e.updatedAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {e.updatedAt.toDate
                    ? e.updatedAt.toDate().toLocaleString()
                    : new Date(e.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
            <StatusBadge status={e.status} className="mt-1" />
            {e.comment && <p className="italic">{e.comment}</p>}
            {e.copyEdit && (
              <p className="italic">
                Copy edit{' '}
                {(() => {
                  if (!origCopy) return e.copyEdit;
                  const diff = diffWords(origCopy, e.copyEdit);
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
  );

  return (
    <aside
      className={`w-full md:w-60 max-h-[70vh] overflow-y-auto dark:text-[var(--dark-text)] ${className}`}
    >
      <div
        className={
          collapsible
            ? 'rounded p-3 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]'
            : ''
        }
      >
        <h3 className="font-semibold mb-2">Feedback</h3>
        {allEmpty ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No feedback yet.</p>
        ) : collapsible && !expanded ? (
          <>
            {latestEntry ? renderList([latestEntry]) : null}
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400"
            >
              See all
            </button>
          </>
        ) : hasMultiple ? (
          versions.map((v) => (
            <div key={v} className="mb-4 last:mb-0">
              <h4
                className="font-semibold mb-1 cursor-pointer"
                onClick={() => onVersionClick && onVersionClick(parseInt(v, 10))}
              >
                V{v} History
              </h4>
              {renderList(lists[v] || [])}
            </div>
          ))
        ) : (
          <div>
            <h4
              className="font-semibold mb-1 cursor-pointer"
              onClick={() =>
                onVersionClick && onVersionClick(parseInt(versions[0] || 1, 10))
              }
            >
              V{versions[0] || 1} History
            </h4>
            {renderList(lists[versions[0] || 1] || [])}
          </div>
        )}
        {collapsible && expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400"
          >
            Hide
          </button>
        )}
      </div>
    </aside>
  );
};

export default FeedbackPanel;

