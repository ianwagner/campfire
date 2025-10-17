import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import Button from './components/Button.jsx';
import TagInput from './components/TagInput.jsx';

const BrandNotes = ({ brandId }) => {
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', tags: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!brandId) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'brands', brandId, 'notes'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => {
          const data = d.data();
          const created = toDate(data.createdAt);
          const updated = toDate(data.updatedAt);
          return {
            id: d.id,
            title: data.title || '',
            body: data.body || data.text || data.note || '',
            createdAt: created,
            updatedAt: updated,
            tags: Array.isArray(data.tags) ? data.tags : [],
          };
        });
        setNotes(items);
      } catch (err) {
        console.error('Failed to load notes', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [brandId]);

  useEffect(() => {
    if (!selectedId) return;
    if (selectedId === 'new') {
      setForm({ title: '', body: '', tags: [] });
      return;
    }
    const match = notes.find((n) => n.id === selectedId);
    if (match) {
      setForm({ title: match.title, body: match.body, tags: Array.isArray(match.tags) ? match.tags : [] });
    } else {
      setSelectedId(null);
    }
  }, [notes, selectedId]);

  const filteredNotes = useMemo(() => {
    if (!filter) return notes;
    const term = filter.toLowerCase();
    return notes.filter((n) =>
      `${n.title} ${stripHtml(n.body)} ${(n.tags || []).join(' ')}`
        .toLowerCase()
        .includes(term)
    );
  }, [notes, filter]);

  const selectedNote = useMemo(
    () => (selectedId && selectedId !== 'new' ? notes.find((n) => n.id === selectedId) : null),
    [notes, selectedId]
  );

  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach((note) => {
      (note.tags || []).forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) {
          tagSet.add(tag.trim());
        }
      });
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const handleSelect = (id) => {
    setError('');
    setSelectedId(id);
  };

  const handleCreateNew = () => {
    setError('');
    setSelectedId('new');
    setForm({ title: '', body: '', tags: [] });
  };

  const handleChangeTitle = (e) => {
    setForm((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleChangeBody = (value) => {
    setForm((prev) => ({ ...prev, body: value }));
  };

  const handleChangeTags = (tags) => {
    setForm((prev) => ({ ...prev, tags }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!brandId) return;
    setIsSaving(true);
    setError('');
    const tags = Array.isArray(form.tags)
      ? form.tags.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
      : [];
    const payload = {
      title: form.title.trim(),
      body: form.body,
      tags,
      updatedAt: serverTimestamp(),
    };
    try {
      if (!selectedId || selectedId === 'new') {
        const docRef = await addDoc(collection(db, 'brands', brandId, 'notes'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        const now = new Date();
        const newNote = {
          id: docRef.id,
          title: payload.title,
          body: payload.body,
          tags: payload.tags,
          createdAt: now,
          updatedAt: now,
        };
        setNotes((prev) => [newNote, ...prev]);
        setSelectedId(docRef.id);
        setForm({ title: payload.title, body: payload.body, tags: payload.tags });
      } else {
        await updateDoc(doc(db, 'brands', brandId, 'notes', selectedId), payload);
        const now = new Date();
        setNotes((prev) =>
          prev.map((note) =>
            note.id === selectedId
              ? { ...note, title: payload.title, body: payload.body, tags: payload.tags, updatedAt: now }
              : note
          )
        );
        setForm({ title: payload.title, body: payload.body, tags: payload.tags });
      }
    } catch (err) {
      console.error('Failed to save note', err);
      setError('Unable to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!brandId || !selectedId || selectedId === 'new') {
      return;
    }
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Delete this note?')
      : true;
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'brands', brandId, 'notes', selectedId));
      setNotes((prev) => prev.filter((note) => note.id !== selectedId));
      setSelectedId(null);
      setForm({ title: '', body: '', tags: [] });
    } catch (err) {
      console.error('Failed to delete note', err);
      setError('Unable to delete note. Please try again.');
    }
  };

  return (
    <PageWrapper>
      <PageToolbar
        left={
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand notes</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {notes.length === 0
                ? 'Capture important details for your team.'
                : `${notes.length} ${notes.length === 1 ? 'note saved' : 'notes saved'}`}
            </p>
          </div>
        }
        right={
          <div className="flex items-center gap-3">
            <div className="relative">
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
                className="w-56 rounded-full border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-opacity-25 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                placeholder="Search notes..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <Button type="button" variant="accentPill" onClick={handleCreateNew}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New note
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <aside className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
          <div className="border-b border-gray-100 px-5 py-4 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {filter ? `Filtered notes (${filteredNotes.length})` : `All notes (${notes.length})`}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {isLoading ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800/60 dark:text-gray-300">
                Loading notes…
              </p>
            ) : filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16h8M8 12h8m-6 8h4a4 4 0 004-4V8a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 0011.586 4H8a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="font-medium">{filter ? 'No matching notes' : 'No notes yet'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {filter
                    ? 'Try a different search term or clear the filter.'
                    : 'Create your first note to share brand context with the team.'}
                </p>
                <Button
                  type="button"
                  variant="accentPillOutline"
                  size="sm"
                  className="mt-2"
                  onClick={handleCreateNew}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add note
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {filteredNotes.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(note.id)}
                      className={`group w-full rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-opacity-40 ${
                        selectedId === note.id
                          ? 'border-[var(--accent-color)] bg-[var(--accent-color-10)] text-[var(--accent-color)] shadow-sm dark:border-[var(--accent-color)] dark:bg-[var(--accent-color-10)] dark:text-[var(--accent-color)]'
                          : 'border-transparent bg-gray-50 hover:border-[var(--accent-color)] hover:bg-[var(--accent-color-10)] dark:bg-gray-800/40 dark:text-[var(--dark-text)] dark:hover:bg-[var(--accent-color-10)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold leading-5 group-hover:text-[var(--accent-color)] dark:group-hover:text-[var(--accent-color)]">
                            {note.title || 'Untitled note'}
                          </h3>
                          <p className="mt-1 line-clamp-3 text-xs text-gray-600 dark:text-gray-300">
                            {truncate(stripHtml(note.body), 160)}
                          </p>
                          {note.tags && note.tags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {note.tags.map((tag) => (
                                <span
                                  key={`${note.id}-${tag}`}
                                  className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800/70 dark:text-gray-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {note.updatedAt && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-400">
                            {note.updatedAt.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        <section className="flex flex-col gap-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!selectedId ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-.586-1.414l-3-3A2 2 0 0015.586 2H7a2 2 0 00-2 2v16a2 2 0 002 2z"
                />
              </svg>
              Select a note from the list or create a new one to start editing.
            </div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="brand-note-title">
                  Title
                </label>
                <input
                  id="brand-note-title"
                  type="text"
                  className="w-full rounded border border-gray-200 bg-white p-2 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-opacity-25 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  value={form.title}
                  onChange={handleChangeTitle}
                  placeholder="Note title"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="brand-note-tags">
                  Tags
                </label>
                <TagInput
                  id="brand-note-tags"
                  value={form.tags}
                  onChange={handleChangeTags}
                  suggestions={allTags}
                  addOnBlur
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Press Enter or comma to add each tag.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Body</label>
                <RichTextEditor value={form.body} onChange={handleChangeBody} disabled={isSaving} />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {selectedNote && displayTimestamp(selectedNote.updatedAt, 'Last updated')}
                </div>
                <div className="flex items-center gap-2">
                  {selectedId !== 'new' && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                  <Button type="submit" variant="accent" size="lg" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save note'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </section>
      </div>
    </PageWrapper>
  );
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const stripHtml = (html = '') => {
  if (!html) return '';
  const tmp = typeof window !== 'undefined' ? window.document.createElement('div') : null;
  if (tmp) {
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
  return html.replace(/<[^>]+>/g, ' ');
};

const truncate = (value, length) => {
  if (!value) return '';
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
};

const displayTimestamp = (date, prefix) => {
  if (!date) return null;
  return `${prefix}: ${date.toLocaleString()}`;
};

const RichTextEditor = ({ value, onChange, disabled }) => {
  const editorRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    const nextValue = value || '';
    if (currentHtml !== nextValue) {
      editorRef.current.innerHTML = nextValue;
    }
  }, [value]);

  const exec = (command, val = null) => {
    if (disabled) return;
    if (typeof document === 'undefined') return;
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    triggerChange();
  };

  const triggerChange = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChange?.(html);
  };

  const handleInput = () => {
    triggerChange();
  };

  const handlePaste = (event) => {
    if (!editorRef.current) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const htmlData = clipboard.getData('text/html');
    if (htmlData) {
      event.preventDefault();
      if (typeof document !== 'undefined') {
        document.execCommand('insertHTML', false, htmlData);
        triggerChange();
      }
    }
  };

  const insertHeading = (level) => exec('formatBlock', `<h${level}>`);
  const insertParagraph = () => exec('formatBlock', '<p>');
  const insertLink = () => {
    if (typeof window === 'undefined') return;
    const url = window.prompt('Enter link URL');
    if (!url) return;
    exec('createLink', url);
  };
  const removeLink = () => exec('unlink');
  const insertTable = () => {
    const tableHtml =
      '<table style="width:100%; border-collapse:collapse;" border="1"><tbody>' +
      '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' +
      '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' +
      '</tbody></table>';
    exec('insertHTML', tableHtml);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <ToolbarButton disabled={disabled} onClick={() => insertHeading(1)}>
          H1
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => insertHeading(2)}>
          H2
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => insertHeading(3)}>
          H3
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={insertParagraph}>¶</ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => exec('bold')}>
          Bold
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => exec('italic')}>
          Italic
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => exec('underline')}>
          Underline
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => exec('insertUnorderedList')}>
          • List
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => exec('insertOrderedList')}>
          1. List
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={insertTable}>
          Table
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={insertLink}>
          Link
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={removeLink}>
          Remove link
        </ToolbarButton>
      </div>
      <div
        ref={editorRef}
        className="min-h-[220px] rounded border border-gray-200 bg-white p-3 text-sm leading-6 focus-within:border-[var(--accent-color)] focus-within:ring-2 focus-within:ring-[var(--accent-color)] focus-within:ring-opacity-25 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        onPaste={handlePaste}
      />
    </div>
  );
};

const ToolbarButton = ({ onClick, children, disabled }) => (
  <button
    type="button"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-opacity-40 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
  >
    {children}
  </button>
);

export default BrandNotes;

