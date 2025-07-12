import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import OptimizedImage from './components/OptimizedImage.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import parseAdFilename from './utils/parseAdFilename.js';
import summarizeByRecipe from './utils/summarizeByRecipe.js';
import { db } from './firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  limit,
} from 'firebase/firestore';

const GroupCard = ({ group }) => {
  const rotations = useMemo(
    () => group.previewAds.map(() => Math.random() * 10 - 5),
    [group.id, group.previewAds.length]
  );

  const first = group.previewAds[0] || {};
  const info = parseAdFilename(first.filename || "");
  const aspect = (first.aspectRatio || info.aspectRatio || "9x16").replace(
    "x",
    "/"
  );

  return (
    <Link to={`/review/${group.id}`} className="block text-center p-3">
      <div className="relative mb-2" style={{ aspectRatio: aspect }}>
        {group.previewAds.map((ad, i) => (
          <OptimizedImage
            key={ad.id}
            pngUrl={ad.thumbnailUrl || ad.firebaseUrl}
            alt={group.name}
            className="absolute inset-0 w-full h-full object-cover rounded shadow"
            style={{
              transform: `rotate(${rotations[i]}deg)`,
              zIndex: i + 1,
              top: `${-i * 4}px`,
              left: `${i * 4}px`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-center items-center gap-2 mb-1 text-sm">
        {group.status !== "ready" && <StatusBadge status={group.status} />}
        {group.hasReady ? (
          <span className="tag tag-new">New!</span>
        ) : group.counts.approved > 0 ? (
          <span className="tag bg-green-500 text-white">
            {group.counts.approved} Approved
          </span>
        ) : null}
      </div>
      <h3 className="font-medium text-gray-700 dark:text-white">{group.name}</h3>
    </Link>
  );
};

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

            let previewSnap;
            try {
              previewSnap = await getDocs(
                query(collection(db, 'adGroups', d.id, 'assets'), limit(3))
              );
            } catch (err) {
              console.error('Failed to load preview ads', err);
              previewSnap = { docs: [] };
            }
            group.previewAds = previewSnap.docs.map((adDoc) => ({
              id: adDoc.id,
              ...adDoc.data(),
            }));

            let hasReady = false;
            try {
              const readySnap = await getDocs(
                query(
                  collection(db, 'adGroups', d.id, 'assets'),
                  where('status', '==', 'ready'),
                  limit(1)
                )
              );
              hasReady = !readySnap.empty;
            } catch (err) {
              console.error('Failed to check ready status', err);
            }
            group.hasReady = hasReady;

            const assetSnap = await getDocs(
              collection(db, 'adGroups', d.id, 'assets')
            );
            const summary = summarizeByRecipe(
              assetSnap.docs.map((adDoc) => adDoc.data())
            );

            group.thumbnail = group.thumbnail || summary.thumbnail;
            group.counts = {
              reviewed: summary.reviewed,
              approved: summary.approved,
              edit: summary.edit,
              rejected: summary.rejected,
            };

            const needsSummary =
              !data.thumbnailUrl ||
              data.reviewedCount !== summary.reviewed ||
              data.approvedCount !== summary.approved ||
              data.editCount !== summary.edit ||
              data.rejectedCount !== summary.rejected;

            if (needsSummary) {
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

  return (
    <div className="min-h-screen p-4">
      {loading ? (
        <p>Loading groups...</p>
      ) : groups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
