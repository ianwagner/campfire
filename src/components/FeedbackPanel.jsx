import React, { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';

const FeedbackPanel = ({ entries = [], className = '', onOpenAsset }) => {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const normalizedEntries = useMemo(
    () =>
      entries.map((entry) => {
        const toDate = (value) => {
          if (!value) return null;
          if (value instanceof Date) return value;
          if (typeof value.toDate === 'function') {
            try {
              return value.toDate();
            } catch (_) {
              return null;
            }
          }
          if (typeof value === 'number') return new Date(value);
          if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
          }
          return null;
        };
        return { ...entry, updatedAt: toDate(entry.updatedAt) };
      }),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return normalizedEntries;
    const term = filter.trim().toLowerCase();
    return normalizedEntries.filter((entry) => {
      const haystack = [
        entry.title,
        entry.subtitle,
        entry.comment,
        entry.copyEdit,
        entry.updatedBy,
        entry.type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [normalizedEntries, filter]);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    const exists = filteredEntries.some((entry) => entry.id === selectedId);
    if (!exists) {
      setSelectedId(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedId]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.id === selectedId) || null,
    [filteredEntries, selectedId],
  );

  const formatListDate = (value) => {
    if (!value) return '';
    try {
      return value.toLocaleDateString();
    } catch (_) {
      return '';
    }
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    try {
      return value.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (_) {
      return value.toString();
    }
  };

  return (
    <div className={className}>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feedback</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {normalizedEntries.length === 0
              ? 'No feedback yet'
              : `${normalizedEntries.length} feedback ${
                  normalizedEntries.length === 1 ? 'entry' : 'entries'
                }`}
          </p>
        </div>
        <div className="grid gap-0 lg:grid-cols-[320px,1fr]">
          <aside className="border-b border-gray-100 px-5 py-4 dark:border-gray-700 lg:border-b-0 lg:border-r">
            <div className="relative mb-3">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35m1.35-4.65a6 6 0 11-12 0 6 6 0 0112 0z"
                  />
                </svg>
              </span>
              <input
                type="text"
                className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-opacity-25 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                placeholder="Search feedback..."
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            {filteredEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                {filter
                  ? 'No feedback matches your search.'
                  : 'Feedback will appear here when clients leave comments.'}
              </div>
            ) : (
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                {filteredEntries.map((entry) => {
                  const isActive = entry.id === selectedId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className={`group w-full rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-opacity-40 ${
                          isActive
                            ? 'border-[var(--accent-color)] bg-[var(--accent-color-10)] text-[var(--accent-color)] shadow-sm dark:border-[var(--accent-color)] dark:bg-[var(--accent-color-10)] dark:text-[var(--accent-color)]'
                            : 'border-transparent bg-gray-50 hover:border-[var(--accent-color)] hover:bg-[var(--accent-color-10)] dark:border-transparent dark:bg-gray-800/40 dark:text-[var(--dark-text)] dark:hover:bg-[var(--accent-color-10)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {entry.type === 'edit' ? 'Edit request' : 'Feedback'}
                              </span>
                              {entry.isArchived ? (
                                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                  Archived
                                </span>
                              ) : null}
                            </div>
                            <h4 className="mt-1 text-sm font-semibold leading-5 group-hover:text-[var(--accent-color)] dark:group-hover:text-[var(--accent-color)]">
                              {entry.title || 'Feedback'}
                            </h4>
                            {entry.subtitle ? (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
                                {entry.subtitle}
                              </p>
                            ) : null}
                          </div>
                          {entry.updatedAt ? (
                            <span className="text-[11px] text-gray-400 dark:text-gray-400">
                              {formatListDate(entry.updatedAt)}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
          <section className="px-5 py-6">
            {!selectedEntry ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                {filteredEntries.length === 0
                  ? 'No feedback available yet.'
                  : 'Select a feedback entry to view the details.'}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedEntry.title || 'Feedback'}
                    </h4>
                    {selectedEntry.recipeCode ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-200">
                        Recipe {selectedEntry.recipeCode}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedEntry.updatedBy
                      ? `Shared by ${selectedEntry.updatedBy}`
                      : 'Shared anonymously'}
                    {selectedEntry.updatedAt
                      ? ` on ${formatDateTime(selectedEntry.updatedAt)}`
                      : ''}
                  </p>
                  {selectedEntry.subtitle ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {selectedEntry.subtitle}
                    </p>
                  ) : null}
                  {selectedEntry.adStatus ? (
                    <div className="mt-2">
                      <StatusBadge status={selectedEntry.adStatus} />
                    </div>
                  ) : null}
                </div>
                {selectedEntry.comment ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Comment
                    </h5>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                      {selectedEntry.comment}
                    </p>
                  </div>
                ) : null}
                {selectedEntry.copyEditDiff ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Copy edit
                    </h5>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                      {selectedEntry.copyEditDiff}
                    </p>
                  </div>
                ) : selectedEntry.copyEdit ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Copy edit
                    </h5>
                    <p className="mt-1 whitespace-pre-line text-sm italic text-gray-700 dark:text-gray-200">
                      {selectedEntry.copyEdit}
                    </p>
                  </div>
                ) : null}
                {selectedEntry.adUrl ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Asset link:{' '}
                    <a
                      href={selectedEntry.adUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-color)] underline"
                    >
                      Open in new tab
                    </a>
                  </div>
                ) : null}
                {onOpenAsset && selectedEntry.assetId ? (
                  <div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onOpenAsset(selectedEntry.assetId)}
                    >
                      View ad
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPanel;

