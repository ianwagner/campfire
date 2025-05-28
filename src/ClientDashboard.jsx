import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from './firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
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
            const data = d.data();
            const group = {
              id: d.id,
              ...data,
              thumbnail: data.thumbnailUrl || '',
              lastUpdated: data.lastUpdated?.toDate
                ? data.lastUpdated.toDate()
                : null,
              counts: {
                reviewed: data.reviewedCount || 0,
                approved: data.approvedCount || 0,
                edit: data.editCount || 0,
                rejected: data.rejectedCount || 0,
              },
            };

            const needsSummary =
              !data.thumbnailUrl ||
              data.reviewedCount === undefined ||
              data.approvedCount === undefined ||
              data.editCount === undefined ||
              data.rejectedCount === undefined;

            if (needsSummary) {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              const summary = {
                reviewed: 0,
                approved: 0,
                edit: 0,
                rejected: 0,
                thumbnail: '',
              };
              assetSnap.docs.forEach((adDoc) => {
                const ad = adDoc.data();
                if (!summary.thumbnail && (ad.thumbnailUrl || ad.firebaseUrl)) {
                  summary.thumbnail = ad.thumbnailUrl || ad.firebaseUrl;
                }
                if (ad.status !== 'ready') summary.reviewed += 1;
                if (ad.status === 'approved') summary.approved += 1;
                if (ad.status === 'edit_requested') summary.edit += 1;
                if (ad.status === 'rejected') summary.rejected += 1;
              });

              group.thumbnail = group.thumbnail || summary.thumbnail;
              group.counts = {
                reviewed: summary.reviewed,
                approved: summary.approved,
                edit: summary.edit,
                rejected: summary.rejected,
              };

              try {
                const update = {
                  reviewedCount: summary.reviewed,
                  approvedCount: summary.approved,
                  editCount: summary.edit,
                  rejectedCount: summary.rejected,
                  ...(data.thumbnailUrl ? {} : summary.thumbnail ? { thumbnailUrl: summary.thumbnail } : {}),
                };
                await updateDoc(doc(db, 'adGroups', d.id), update);
              } catch (err) {
                console.error('Failed to update group summary', err);
              }
            }

            return group;
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
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Client Dashboard</h1>
      {loading ? (
        <p>Loading groups...</p>
      ) : groups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {groups.map((g) => {
            const viewedStr = localStorage.getItem(`lastViewed-${g.id}`);
            const lastViewed = viewedStr ? new Date(viewedStr) : lastLogin;
            const isNew = g.lastUpdated && (!lastViewed || g.lastUpdated > lastViewed);
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
                      loading="lazy"
                      className="w-full md:w-32 h-48 md:h-auto object-cover"
                    />
                  )}
                  <div className="p-3 flex flex-col flex-grow">
                    <div className="flex items-center mb-1">
                      <h3 className="font-medium flex-grow">{g.name}</h3>
                      {isNew && (
                        <span className="ml-2 tag tag-new">NEW</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{dateStr}</p>
                    <div className="mt-auto flex flex-wrap gap-1 text-xs">
                      <span className="tag tag-pill">REVIEWED {g.counts.reviewed}</span>
                      <span className="tag tag-pill">APPROVED {g.counts.approved}</span>
                      <span className="tag tag-pill">EDIT REQUEST {g.counts.edit}</span>
                      <span className="tag tag-pill">REJECTED {g.counts.rejected}</span>
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
