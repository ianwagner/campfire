import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

const ClientDashboard = ({ user, brandCodes = [] }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroups = async () => {
      if (!user?.uid || brandCodes.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const q = query(
          collection(db, 'adGroups'),
          where('brandCode', 'in', brandCodes),
          where('status', '==', 'ready')
        );
        const snap = await getDocs(q);
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', d.id, 'assets')
            );
            let reviewed = 0;
            let approved = 0;
            let edit = 0;
            let rejected = 0;
            let thumbnail = '';
            let lastUpdated = null;
            assetsSnap.forEach((a) => {
              const data = a.data();
              if (!thumbnail && data.firebaseUrl) {
                thumbnail = data.firebaseUrl;
              }
              const st = data.status;
              if (st !== 'pending' && st !== 'new' && st !== 'draft') {
                reviewed += 1;
              }
              if (st === 'approved') approved += 1;
              if (st === 'edit_requested') edit += 1;
              if (st === 'rejected') rejected += 1;
              const updated = data.lastUpdatedAt?.toDate
                ? data.lastUpdatedAt.toDate()
                : null;
              if (updated && (!lastUpdated || updated > lastUpdated)) {
                lastUpdated = updated;
              }
            });
            return {
              id: d.id,
              ...d.data(),
              thumbnail,
              lastUpdated,
              counts: { reviewed, approved, edit, rejected },
            };
          })
        );
        setGroups(list);
      } catch (err) {
        console.error('Failed to fetch groups', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [brandCodes, user]);

  const lastLogin = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime)
    : null;

  return (
    <div className="p-4">
      <div className="flex justify-between items-start">
        <h1 className="text-2xl mb-4">Client Dashboard</h1>
        <button
          onClick={() => signOut(auth)}
          className="text-sm text-gray-500 hover:text-black underline mt-4"
        >
          Log Out
        </button>
      </div>
      {loading ? (
        <p>Loading groups...</p>
      ) : groups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {groups.map((g) => {
            const isNew = lastLogin && g.lastUpdated && g.lastUpdated > lastLogin;
            const date = g.lastUpdated
              ? g.lastUpdated
              : g.createdAt?.toDate
              ? g.createdAt.toDate()
              : null;
            const dateStr = date
              ? date.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            return (
              <Link
                to={`/review/${g.id}`}
                key={g.id}
                className="border rounded shadow bg-white overflow-hidden block"
              >
                <div className="flex flex-col md:flex-row">
                  {g.thumbnail && (
                    <img
                      src={g.thumbnail}
                      alt={g.name}
                      className="w-full md:w-32 h-48 md:h-auto object-cover"
                    />
                  )}
                  <div className="p-3 flex flex-col flex-grow">
                    <div className="flex items-center mb-1">
                      <h3 className="font-medium flex-grow">{g.name}</h3>
                      {isNew && (
                        <span className="ml-2 bg-red-500 text-black text-xs px-2 py-0.5 rounded-full">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{dateStr}</p>
                    <div className="mt-auto flex flex-wrap gap-1 text-xs">
                      <span className="bg-gray-200 px-2 py-0.5 rounded-full">
                        REVIEWED {g.counts.reviewed}
                      </span>
                      <span className="bg-gray-200 px-2 py-0.5 rounded-full">
                        APPROVED {g.counts.approved}
                      </span>
                      <span className="bg-gray-200 px-2 py-0.5 rounded-full">
                        EDIT REQUEST {g.counts.edit}
                      </span>
                      <span className="bg-gray-200 px-2 py-0.5 rounded-full">
                        REJECTED {g.counts.rejected}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
