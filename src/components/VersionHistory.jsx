import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const VersionHistory = ({ asset, className = '' }) => {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!asset?.assetId || !asset?.adGroupId) {
      setHistory([]);
      return;
    }

    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId, 'history'),
          orderBy('updatedAt', 'desc'),
        );
        const snap = await getDocs(q);
        const list = [];
        const uids = new Set();
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          const uid = data.updatedBy;
          if (uid) uids.add(uid);
          list.push({
            id: d.id,
            lastUpdatedAt: data.updatedAt,
            email: uid || 'N/A',
            status: data.status,
            comment: data.comment || '',
            copyEdit: data.copyEdit || '',
          });
        });

        const userMap = {};
        await Promise.all(
          Array.from(uids).map(async (uid) => {
            try {
              const uSnap = await getDoc(doc(db, 'users', uid));
              userMap[uid] = uSnap.exists()
                ? uSnap.data().fullName || uSnap.data().email || uid
                : uid;
            } catch {
              userMap[uid] = uid;
            }
          }),
        );

        list.forEach((obj) => {
          if (userMap[obj.email]) obj.email = userMap[obj.email];
        });

        setHistory(list);
      } catch (err) {
        console.error('Failed to load history', err);
        setHistory([]);
      }
    };

    fetchHistory();
  }, [asset]);

  if (!asset) return null;

  return (
    <div
      className={`absolute top-0 left-full ml-4 w-64 text-sm max-h-[70vh] overflow-auto bg-white bg-opacity-80 p-2 rounded shadow dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)] ${className}`}
    >
      <h4 className="font-semibold mb-2">Version History</h4>
      <ul className="space-y-2">
        {history.map((h) => (
          <li key={h.id} className="border-b pb-1 last:border-none">
            <div>
              {h.lastUpdatedAt
                ? h.lastUpdatedAt.toDate
                  ? h.lastUpdatedAt.toDate().toLocaleString()
                  : new Date(h.lastUpdatedAt).toLocaleString()
                : ''}{' '}
              - {h.email}
            </div>
            <div>Status: {h.status}</div>
            {h.comment && <div className="italic">Note: {h.comment}</div>}
            {h.copyEdit && <div className="italic">Edit Request: {h.copyEdit}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VersionHistory;
