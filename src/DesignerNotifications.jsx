import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { FiTrash } from 'react-icons/fi';
import { db } from './firebase/config';

const READ_KEY = 'designerNotificationsRead';
const DISMISS_KEY = 'designerNotificationsDismissed';

const DesignerNotifications = () => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'notifications'),
            where('audience', '==', 'designer'),
            orderBy('createdAt', 'desc')
          )
        );
        const dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => !dismissed.includes(n.id));
        setNotes(list);

        const readIds = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
        const all = new Set([...readIds, ...list.map((n) => n.id)]);
        localStorage.setItem(READ_KEY, JSON.stringify(Array.from(all)));
      } catch (err) {
        console.error('Failed to load notifications', err);
        setNotes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, []);

  const handleDismiss = (id) => {
    const dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    if (!dismissed.includes(id)) dismissed.push(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
    setNotes((n) => n.filter((note) => note.id !== id));
  };

  const handleClearAll = () => {
    const dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    const toAdd = notes.map((n) => n.id).filter((id) => !dismissed.includes(id));
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed, ...toAdd]));
    setNotes([]);
  };

  const readIds = JSON.parse(localStorage.getItem(READ_KEY) || '[]');

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notifications</h1>
      {loading ? (
        <p>Loading...</p>
      ) : notes.length === 0 ? (
        <p>No notifications found.</p>
      ) : (
        <>
          <div className="text-right mb-4">
            <button onClick={handleClearAll} className="underline text-sm">
              Clear All
            </button>
          </div>
          <div className="space-y-4">
            {notes.map((n) => (
              <div
                key={n.id}
                className="border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h2 className="font-semibold text-black dark:text-[var(--dark-text)] flex items-center">
                      {!readIds.includes(n.id) && (
                        <span
                          className="inline-block w-2 h-2 bg-accent rounded-full mr-2"
                          aria-label="new"
                        />
                      )}
                      {n.title}
                    </h2>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-black dark:text-[var(--dark-text)]">
                      {n.body}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismiss(n.id)}
                    aria-label="Dismiss"
                    className="text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
                  >
                    <FiTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default DesignerNotifications;
