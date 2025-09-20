import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { FiTrash } from 'react-icons/fi';
import { db } from './firebase/config';
import chunkArray from './utils/chunkArray.js';

const READ_KEY = 'designerNotificationsRead';
const DISMISS_KEY = 'designerNotificationsDismissed';

const DesignerNotifications = ({ brandCodes = [] }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const baseQuery = query(
          collection(db, 'notifications'),
          where('audience', '==', 'designer'),
          orderBy('createdAt', 'desc')
        );

        let docs = [];
        if (brandCodes.length > 0) {
          const chunks = chunkArray(brandCodes, 10);
          const snaps = await Promise.all(
            chunks.map((chunk) =>
              getDocs(query(baseQuery, where('brandCode', 'in', chunk)))
            )
          );
          docs = snaps.flatMap((s) => s.docs);
        } else {
          const snap = await getDocs(baseQuery);
          docs = snap.docs;
        }

        const deduped = new Map();
        docs.forEach((d) => {
          deduped.set(d.id, { id: d.id, ...d.data() });
        });
        const list = Array.from(deduped.values()).sort((a, b) => {
          const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : null;
          const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : null;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return bDate - aDate;
        });
        let dismissed = [];
        try {
          dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
        } catch (e) {
          dismissed = [];
        }
        const filtered = list.filter((n) => !dismissed.includes(n.id));
        setNotes(filtered);

        let readIds = [];
        try {
          readIds = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
        } catch (e) {
          readIds = [];
        }
        const all = new Set([...readIds, ...filtered.map((n) => n.id)]);
        try {
          localStorage.setItem(READ_KEY, JSON.stringify(Array.from(all)));
        } catch (e) {
          /* ignore */
        }
      } catch (err) {
        console.error('Failed to load notifications', err);
        setNotes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, [brandCodes]);

  const handleDismiss = (id) => {
    let dismissed = [];
    try {
      dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    } catch (e) {
      dismissed = [];
    }
    if (!dismissed.includes(id)) dismissed.push(id);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
    } catch (e) {
      /* ignore */
    }
    setNotes((n) => n.filter((note) => note.id !== id));
  };

  const handleClearAll = () => {
    let dismissed = [];
    try {
      dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    } catch (e) {
      dismissed = [];
    }
    const toAdd = notes.map((n) => n.id).filter((id) => !dismissed.includes(id));
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed, ...toAdd]));
    } catch (e) {
      /* ignore */
    }
    setNotes([]);
  };

  let readIds = [];
  try {
    readIds = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
  } catch (e) {
    readIds = [];
  }

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
                    {n.url ? (
                      <Link to={n.url} className="block">
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
                      </Link>
                    ) : (
                      <>
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
                      </>
                    )}
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
