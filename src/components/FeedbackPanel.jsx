import React, { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.getTime().toString();
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value).trim().toLowerCase();
};

const dedupeItems = (items, getKey) => {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const deduped = [];
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = getKey(item);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    deduped.push(item);
  });
  return deduped;
};

const sortByDateDesc = (items) =>
  items.slice().sort((a, b) => {
    const aTime = a?.updatedAt?.getTime?.() || 0;
    const bTime = b?.updatedAt?.getTime?.() || 0;
    return bTime - aTime;
  });

const sanitizeTimelineItems = (items, { includeEmptyText = false } = {}) =>
  sortByDateDesc(
    dedupeItems(
      (Array.isArray(items) ? items : [])
        .map((item) => ({
          ...item,
          text: typeof item?.text === 'string' ? item.text.trim() : item?.text || '',
          assetLabel:
            typeof item?.assetLabel === 'string' ? item.assetLabel.trim() : item?.assetLabel || '',
          updatedAt: toDateValue(item?.updatedAt),
          updatedBy: item?.updatedBy || '',
          status: item?.status || '',
        }))
        .filter((item) => (includeEmptyText ? true : Boolean(item.text))),
      (item) => {
        const baseKey = [
          normalizeKeyPart(item?.text || ''),
          normalizeKeyPart(item?.assetLabel || ''),
          normalizeKeyPart(item?.assetId || ''),
        ].join('|');
        if (baseKey.replace(/\|/g, '') === '' && item?.id) {
          return normalizeKeyPart(item.id);
        }
        return baseKey;
      },
    ),
  );

const sanitizeCopyItems = (items) =>
  sortByDateDesc(
    dedupeItems(
      (Array.isArray(items) ? items : [])
        .map((item) => ({
          ...item,
          text: typeof item?.text === 'string' ? item.text.trim() : item?.text || '',
          assetLabel:
            typeof item?.assetLabel === 'string' ? item.assetLabel.trim() : item?.assetLabel || '',
          updatedAt: toDateValue(item?.updatedAt),
          updatedBy: item?.updatedBy || '',
          status: item?.status || '',
        }))
        .filter((item) => Boolean(item.text) || Boolean(item.diff)),
      (item) => {
        const textKey = normalizeKeyPart(item?.text || '');
        const assetKey = normalizeKeyPart(item?.assetLabel || '');
        const assetIdKey = normalizeKeyPart(item?.assetId || '');
        const combined = [textKey, assetKey, assetIdKey].join('|');
        if (combined.replace(/\|/g, '') === '' && item?.id) {
          return normalizeKeyPart(item.id);
        }
        return combined;
      },
    ),
  );

const getEntryDisplayTitle = (entry) => {
  if (!entry) return 'Feedback';
  const recipeLabel = entry.recipeCode ? `Recipe #${entry.recipeCode}` : '';
  if (recipeLabel) {
    const normalizedTitle = (entry.title || '').trim();
    const recipeTitle = `Recipe ${entry.recipeCode}`.trim();
    let prefix = '';
    if (entry.groupName) {
      prefix = entry.groupName;
    } else if (
      normalizedTitle &&
      normalizedTitle.toLowerCase() !== recipeTitle.toLowerCase()
    ) {
      prefix = normalizedTitle;
    }
    return [prefix, recipeLabel].filter(Boolean).join(' ') || recipeLabel;
  }
  if (entry.groupName && entry.title && entry.title !== entry.groupName) {
    return `${entry.groupName} ${entry.title}`;
  }
  if (entry.groupName) return entry.groupName;
  return entry.title || 'Feedback';
};

const toDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (err) {
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

const FeedbackPanel = ({
  entries = [],
  className = '',
  onOpenAsset,
  scopeOptions = [],
  selectedScope,
  onScopeChange,
  loading = false,
}) => {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const normalizedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        updatedAt: toDateValue(entry.updatedAt),
        commentList: sanitizeTimelineItems(entry.commentList),
        copyEditList: sanitizeCopyItems(entry.copyEditList),
      })),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return normalizedEntries;
    const term = filter.trim().toLowerCase();
    return normalizedEntries.filter((entry) => {
      const haystack = [
        getEntryDisplayTitle(entry),
        entry.title,
        entry.subtitle,
        entry.comment,
        entry.copyEdit,
        entry.updatedBy,
        entry.type,
        entry.groupName,
        ...entry.commentList.map((item) => item?.text || ''),
        ...entry.copyEditList.map((item) => item?.text || ''),
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
    } catch (err) {
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
    } catch (err) {
      return value.toString();
    }
  };

  const activeScope = selectedScope ?? scopeOptions?.[0]?.value ?? '';
  const scopeEnabled =
    Array.isArray(scopeOptions) && scopeOptions.length > 1 && typeof onScopeChange === 'function';
  const headerDescription = loading
    ? 'Loading feedback…'
    : normalizedEntries.length === 0
    ? 'No feedback yet'
    : `${normalizedEntries.length} feedback ${
        normalizedEntries.length === 1 ? 'entry' : 'entries'
      }`;

  return (
    <div className={className}>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feedback</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{headerDescription}</p>
            </div>
            {scopeEnabled ? (
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
                Showing
                <select
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200"
                  value={activeScope}
                  onChange={(event) => onScopeChange(event.target.value)}
                >
                  {scopeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
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
            {loading && filteredEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                Loading feedback…
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                {filter
                  ? 'No feedback matches your search.'
                  : 'Feedback will appear here when clients leave comments.'}
              </div>
            ) : (
              <ul className="flex max-h-[32rem] min-h-[18rem] flex-col gap-2 overflow-y-auto pr-1">
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
                              {getEntryDisplayTitle(entry)}
                            </h4>
                            {entry.subtitle ? (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{entry.subtitle}</p>
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
                      {`${getEntryDisplayTitle(selectedEntry)} – Details`}
                    </h4>
                    {selectedEntry.recipeCode ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-200">
                        Recipe #{selectedEntry.recipeCode}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedEntry.updatedBy
                      ? `Shared by ${selectedEntry.updatedBy}`
                      : 'Shared anonymously'}
                    {selectedEntry.updatedAt ? ` on ${formatDateTime(selectedEntry.updatedAt)}` : ''}
                  </p>
                  {selectedEntry.groupName ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEntry.groupName}</p>
                  ) : null}
                  {selectedEntry.subtitle ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedEntry.subtitle}</p>
                  ) : null}
                  {selectedEntry.adStatus ? (
                    <div className="mt-2">
                      <StatusBadge status={selectedEntry.adStatus} />
                    </div>
                  ) : null}
                </div>

                {selectedEntry.commentList.length ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Comments</h5>
                    <div className="mt-2 space-y-3">
                      {selectedEntry.commentList.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-transparent"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{item.assetLabel || 'Comment'}</span>
                            {item.updatedAt ? <span>{formatDateTime(toDateValue(item.updatedAt))}</span> : null}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-200">{item.text}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {item.updatedBy ? <span>From {item.updatedBy}</span> : null}
                            {onOpenAsset && item.assetId ? (
                              <button
                                type="button"
                                className="btn-tertiary px-2 py-1 text-xs"
                                onClick={() => onOpenAsset(item.assetId)}
                              >
                                View ad
                              </button>
                            ) : item.adUrl ? (
                              <a
                                href={item.adUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent-color)] underline"
                              >
                                Open asset
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedEntry.comment ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Comment</h5>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                      {selectedEntry.comment}
                    </p>
                  </div>
                ) : null}

                {selectedEntry.copyEditList.length ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Copy edits</h5>
                    <div className="mt-2 space-y-3">
                      {selectedEntry.copyEditList.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-transparent"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{item.assetLabel || 'Copy edit'}</span>
                            {item.updatedAt ? <span>{formatDateTime(toDateValue(item.updatedAt))}</span> : null}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                            {item.diff || item.text}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {item.updatedBy ? <span>From {item.updatedBy}</span> : null}
                            {onOpenAsset && item.assetId ? (
                              <button
                                type="button"
                                className="btn-tertiary px-2 py-1 text-xs"
                                onClick={() => onOpenAsset(item.assetId)}
                              >
                                View ad
                              </button>
                            ) : item.adUrl ? (
                              <a
                                href={item.adUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent-color)] underline"
                              >
                                Open asset
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedEntry.copyEditDiff ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Copy edit</h5>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                      {selectedEntry.copyEditDiff}
                    </p>
                  </div>
                ) : selectedEntry.copyEdit ? (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Copy edit</h5>
                    <p className="mt-1 whitespace-pre-line text-sm italic text-gray-700 dark:text-gray-200">
                      {selectedEntry.copyEdit}
                    </p>
                  </div>
                ) : null}

                {selectedEntry.adUrl ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Asset link{' '}
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
