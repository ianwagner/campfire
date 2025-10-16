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

const BrandNotes = ({ brandId }) => {
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });
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
      setForm({ title: '', body: '' });
      return;
    }
    const match = notes.find((n) => n.id === selectedId);
    if (match) {
      setForm({ title: match.title, body: match.body });
    } else {
      setSelectedId(null);
    }
  }, [notes, selectedId]);

  const filteredNotes = useMemo(() => {
    if (!filter) return notes;
    const term = filter.toLowerCase();
    return notes.filter((n) =>
      `${n.title} ${stripHtml(n.body)}`.toLowerCase().includes(term)
    );
  }, [notes, filter]);

  const handleSelect = (id) => {
    setError('');
    setSelectedId(id);
  };

  const handleCreateNew = () => {
    setError('');
    setSelectedId('new');
    setForm({ title: '', body: '' });
  };

  const handleChangeTitle = (e) => {
    setForm((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleChangeBody = (value) => {
    setForm((prev) => ({ ...prev, body: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!brandId) return;
    setIsSaving(true);
    setError('');
    const payload = {
      title: form.title.trim(),
      body: form.body,
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
          createdAt: now,
          updatedAt: now,
        };
        setNotes((prev) => [newNote, ...prev]);
        setSelectedId(docRef.id);
        setForm({ title: payload.title, body: payload.body });
      } else {
        await updateDoc(doc(db, 'brands', brandId, 'notes', selectedId), payload);
        const now = new Date();
        setNotes((prev) =>
          prev.map((note) =>
            note.id === selectedId
              ? { ...note, title: payload.title, body: payload.body, updatedAt: now }
              : note
          )
        );
        setForm({ title: payload.title, body: payload.body });
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
      setForm({ title: '', body: '' });
    } catch (err) {
      console.error('Failed to delete note', err);
      setError('Unable to delete note. Please try again.');
    }
  };

  return (
    <PageWrapper>
      <PageToolbar
        right={
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="p-2 border rounded w-48"
              placeholder="Search notes..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              onClick={handleCreateNew}
            >
              New note
            </button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <aside className="flex flex-col gap-3">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading notes…</p>
          ) : filteredNotes.length === 0 ? (
            <p className="text-sm text-gray-500">No notes found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredNotes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(note.id)}
                    className={`w-full text-left border rounded p-3 bg-white dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)] hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selectedId === note.id ? 'border-blue-500 shadow-sm' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm truncate">
                        {note.title || 'Untitled note'}
                      </h3>
                      {note.updatedAt && (
                        <span className="text-[11px] text-gray-500">
                          {note.updatedAt.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-h-16 overflow-hidden text-xs text-gray-600 dark:text-gray-300">
                      {truncate(stripHtml(note.body), 200)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="flex flex-col gap-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!selectedId ? (
            <div className="rounded border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:text-gray-300">
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
                  className="w-full rounded border border-gray-200 bg-white p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  value={form.title}
                  onChange={handleChangeTitle}
                  placeholder="Note title"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Body</label>
                <RichTextEditor value={form.body} onChange={handleChangeBody} disabled={isSaving} />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {selectedId !== 'new' && (
                    <>
                      {displayTimestamp(
                        notes.find((n) => n.id === selectedId)?.updatedAt,
                        'Last updated'
                      )}
                    </>
                  )}
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
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? 'Saving…' : 'Save note'}
                  </button>
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
        className="min-h-[220px] rounded border border-gray-200 bg-white p-3 text-sm leading-6 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
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
    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
  >
    {children}
  </button>
);

export default BrandNotes;

