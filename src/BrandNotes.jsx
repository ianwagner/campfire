import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const BrandNotes = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editText, setEditText] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (propId) {
        try {
          const snap = await getDoc(doc(db, 'brands', propId));
          if (snap.exists()) {
            const data = snap.data();
            setBrandId(propId);
            setBrandCode(data.code || propCode);
            setNotes(Array.isArray(data.notes) ? data.notes : []);
          }
        } catch (err) {
          console.error('Failed to load brand notes', err);
        } finally {
          setLoading(false);
        }
      } else if (propCode) {
        try {
          const q = query(collection(db, 'brands'), where('code', '==', propCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            const data = docData.data();
            setBrandId(docData.id);
            setBrandCode(data.code || propCode);
            setNotes(Array.isArray(data.notes) ? data.notes : []);
          }
        } catch (err) {
          console.error('Failed to load brand notes', err);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    load();
  }, [propId, propCode]);

  const saveNotes = async (list) => {
    if (!brandId) return;
    try {
      await updateDoc(doc(db, 'brands', brandId), { notes: list });
      setNotes(list);
    } catch (err) {
      console.error('Failed to save notes', err);
      setMessage('Failed to save');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const text = newNote.trim();
    if (!text) return;
    const list = [...notes, { id: Date.now().toString(), text }];
    await saveNotes(list);
    setNewNote('');
  };

  const handleEditSave = async () => {
    if (editIdx === null) return;
    const text = editText.trim();
    if (!text) return;
    const list = notes.map((n, i) => (i === editIdx ? { ...n, text } : n));
    await saveNotes(list);
    setEditIdx(null);
    setEditText('');
  };

  const handleDelete = async (idx) => {
    const list = notes.filter((_, i) => i !== idx);
    await saveNotes(list);
  };

  if (loading) return <p>Loading notes...</p>;

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Brand Notes</h1>
      {notes.map((note, idx) => (
        <div key={note.id || idx} className="mb-3">
          {editIdx === idx ? (
            <div>
              <textarea
                className="w-full border rounded p-2 text-black dark:text-black"
                rows={3}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="flex gap-2 mt-1">
                <button onClick={handleEditSave} className="btn-primary px-2 py-0.5">
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditIdx(null);
                    setEditText('');
                  }}
                  className="btn-secondary px-2 py-0.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="p-2 bg-white shadow rounded-xl relative whitespace-pre-wrap">
              <button
                onClick={() => {
                  setEditIdx(idx);
                  setEditText(note.text);
                }}
                className="absolute top-1 right-12 btn-secondary px-1 py-0.5 text-xs"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(idx)}
                className="absolute top-1 right-1 btn-delete px-1 py-0.5 text-xs"
              >
                Delete
              </button>
              {note.text}
            </div>
          )}
        </div>
      ))}
      <form onSubmit={handleAdd} className="space-y-2 max-w-md">
        <textarea
          className="w-full border rounded p-2 text-black dark:text-black"
          rows={3}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
        />
        {message && <p className="text-sm">{message}</p>}
        <button type="submit" className="btn-primary" disabled={!brandId}>
          Add Note
        </button>
      </form>
    </div>
  );
};

export default BrandNotes;
