import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import PageToolbar from './components/PageToolbar.jsx';

const BrandNotes = ({ brandId }) => {
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!brandId) return;
      try {
        const q = query(
          collection(db, 'brands', brandId, 'notes'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => {
          const data = d.data();
          const created = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : data.createdAt instanceof Date
            ? data.createdAt
            : null;
          return {
            id: d.id,
            text: data.text || data.note || '',
            createdAt: created,
          };
        });
        setNotes(items);
      } catch (err) {
        console.error('Failed to load notes', err);
      }
    };
    load();
  }, [brandId]);

  const filtered = notes.filter((n) =>
    n.text.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <PageWrapper>
      <PageToolbar
        right={
          <input
            type="text"
            className="p-2 border rounded w-48"
            placeholder="Search notes..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        }
      />
      {filtered.length === 0 ? (
        <p>No notes found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((note) => (
            <div
              key={note.id}
              className="p-4 border rounded shadow-sm bg-white dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
            >
              {note.createdAt && (
                <p className="text-xs text-gray-500 mb-2">
                  {note.createdAt.toLocaleDateString()}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap">{note.text}</p>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
};

export default BrandNotes;

