import React, { useMemo, useState } from 'react';
import { FiFilter, FiSearch } from 'react-icons/fi';
import { useBrandAssets } from './useBrandAssets.js';

const stripHtml = (value = '') =>
  value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const normalizeBrandNotes = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (!item) return null;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const rawBody = item.body || item.text || item.note || '';
      const body = typeof rawBody === 'string' ? rawBody : '';
      const tags = Array.isArray(item.tags)
        ? item.tags
            .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
            .filter(Boolean)
        : [];
      const createdAt = normalizeTimestamp(item.createdAt);
      const updatedAt = normalizeTimestamp(item.updatedAt);
      const plainText = stripHtml(body || title);
      if (!plainText) return null;
      return {
        id: item.id || `note-${index}`,
        title,
        body,
        plainText,
        tags,
        createdAt,
        updatedAt,
      };
    })
    .filter(Boolean);
};

const mergeNotes = (primary = [], secondary = []) => {
  const seen = new Map();
  const merged = [];
  primary.forEach((note) => {
    if (!note) return;
    const key = note.id || `${note.title}-${note.plainText}`;
    if (seen.has(key)) return;
    seen.set(key, true);
    merged.push(note);
  });
  secondary.forEach((note) => {
    if (!note) return;
    const key = note.id || `${note.title}-${note.plainText}`;
    if (seen.has(key)) return;
    seen.set(key, true);
    merged.push(note);
  });
  return merged;
};

const BrandNotesPanel = ({ brandCode, brandNotes = [] }) => {
  const { loading, profileNotes, brandNotes: storedBrandNotes } = useBrandAssets(brandCode);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');

  const firestoreNotes = useMemo(() => normalizeBrandNotes(brandNotes), [brandNotes]);
  const libraryNotes = useMemo(() => normalizeBrandNotes(storedBrandNotes), [storedBrandNotes]);
  const internalNotes = useMemo(
    () =>
      Array.isArray(profileNotes)
        ? profileNotes
            .map((note, index) => {
              if (!note) return null;
              const rawBody = note.body || note.text || note.note || '';
              const body = typeof rawBody === 'string' ? rawBody : '';
              const plainText = stripHtml(body || note.title || '');
              if (!plainText) return null;
              const tags = Array.isArray(note.tags)
                ? note.tags
                    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
                    .filter(Boolean)
                : [];
              return {
                id: note.id || `internal-${index}`,
                title: typeof note.title === 'string' ? note.title.trim() : '',
                body,
                plainText,
                tags,
                createdAt: normalizeTimestamp(note.createdAt),
                updatedAt: normalizeTimestamp(note.updatedAt),
              };
            })
            .filter(Boolean)
        : [],
    [profileNotes],
  );

  const combinedNotes = useMemo(() => {
    const firstPass = mergeNotes(firestoreNotes, libraryNotes);
    return mergeNotes(firstPass, internalNotes);
  }, [firestoreNotes, internalNotes, libraryNotes]);

  const noteTags = useMemo(() => {
    const tagSet = new Set();
    combinedNotes.forEach((note) => {
      note.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [combinedNotes]);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return combinedNotes.filter((note) => {
      if (selectedTag !== 'all' && !note.tags.includes(selectedTag)) {
        return false;
      }
      if (!term) return true;
      const haystack = `${note.title} ${note.plainText}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [combinedNotes, searchTerm, selectedTag]);

  const hasNotes = combinedNotes.length > 0;

  return (
    <div className="my-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand Notes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Search and filter messaging insights from the brand library and saved notes.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search notes..."
                className="w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
              />
            </div>
            <div className="relative w-full sm:w-48">
              <FiFilter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.target.value)}
                className="w-full appearance-none rounded-full border border-gray-300 bg-white py-2 pl-10 pr-8 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
              >
                <option value="all">All tags</option>
                {noteTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
            Loading notes...
          </p>
        ) : hasNotes ? (
          filteredNotes.length > 0 ? (
            <div className="flex flex-col gap-4">
              {filteredNotes.map((note) => {
                const timestamp = note.updatedAt || note.createdAt;
                const timestampLabel = note.updatedAt ? 'Updated' : note.createdAt ? 'Created' : '';
                return (
                  <article
                    key={note.id}
                    className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5 transition-shadow hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                  >
                    {note.title ? (
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{note.title}</h3>
                    ) : null}
                    <div
                      className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200 dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: note.body || note.plainText }}
                    />
                    {note.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {timestamp ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {timestampLabel} {timestamp.toLocaleString()}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
              No notes match your filters yet.
            </p>
          )
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
            No brand notes have been added yet.
          </p>
        )}
      </section>
    </div>
  );
};

export default BrandNotesPanel;
