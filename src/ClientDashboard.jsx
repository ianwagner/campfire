import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import OptimizedImage from './components/OptimizedImage.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import MonthTag from './components/MonthTag.jsx';
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
  onSnapshot,
} from 'firebase/firestore';

const GroupCard = ({ group }) => {
  const rotations = useMemo(
    () => group.previewAds.map(() => Math.random() * 10 - 5),
    [group.id, group.previewAds.length]
  );

  const showLogo = group.showLogo;
  const first = group.previewAds[0] || {};
  const info = parseAdFilename(first.filename || "");
  const aspect = showLogo
    ? "1/1"
    : (first.aspectRatio || info.aspectRatio || "9x16").replace("x", "/");

  return (
    <Link to={`/review/${group.id}`} className="block text-center p-3">
      <div className="relative mb-2" style={{ aspectRatio: aspect }}>
        {showLogo ? (
          <OptimizedImage
            key="logo"
            pngUrl={group.brandLogo}
            alt={group.name}
            className="absolute inset-0 w-full h-full object-contain rounded shadow"
          />
        ) : (
          group.previewAds.map((ad, i) => (
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
          ))
        )}
      </div>
      <div className="flex justify-center items-center gap-2 mb-1 text-sm">
        {group.status !== 'ready' && <StatusBadge status={group.status} />}
      </div>
      <h3 className="font-medium text-gray-700 dark:text-white">{group.name}</h3>
      <div className="flex justify-center items-center gap-2 mt-1 text-sm">
        {group.month && <MonthTag month={group.month} />}
        <span className="text-gray-500 dark:text-gray-300">{group.totalAds} ads</span>
      </div>
    </Link>
  );
};

const ClientDashboard = ({ user, brandCodes = [] }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasNegativeCredits, setHasNegativeCredits] = useState(false);
  const [brandLogos, setBrandLogos] = useState({});
  const [filter, setFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const months = useMemo(
    () =>
      Array.from(new Set(groups.map((g) => g.month).filter(Boolean))).sort(),
    [groups]
  );
  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.name.toLowerCase().includes(filter.toLowerCase()) &&
          (!monthFilter || g.month === monthFilter)
      ),
    [groups, filter, monthFilter]
  );

  useEffect(() => {
    if (brandCodes.length === 0) {
      setHasNegativeCredits(false);
      setBrandLogos({});
      return;
    }
    const checkCredits = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'brands'), where('code', 'in', brandCodes))
        );
        const negative = snap.docs.some(
          (d) => (d.data().credits ?? 0) < 0
        );
        setHasNegativeCredits(negative);
        const logos = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          logos[data.code] = data.logos?.[0] || data.logoUrl || '';
        });
        setBrandLogos(logos);
      } catch (err) {
        console.error('Failed to check brand credits', err);
        setHasNegativeCredits(false);
        setBrandLogos({});
      }
    };
    checkCredits();
  }, [brandCodes]);

  useEffect(() => {
    if (!user?.uid || brandCodes.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'adGroups'),
      where('brandCode', 'in', brandCodes)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        try {
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
                archived: data.archivedCount || 0,
                edit: data.editCount || 0,
                rejected: data.rejectedCount || 0,
              },
            };

            let previewSnap;
            try {
              previewSnap = await getDocs(
                query(
                  collection(db, 'adGroups', d.id, 'assets'),
                  where('aspectRatio', '==', '1x1'),
                  limit(3)
                )
              );
            } catch (err) {
              console.error('Failed to load preview ads', err);
              previewSnap = { docs: [] };
            }
            group.previewAds = previewSnap.docs.map((adDoc) => ({
              id: adDoc.id,
              ...adDoc.data(),
            }));
            group.showLogo =
              group.previewAds.length === 0 ||
              group.previewAds.every((a) => a.status === 'pending');
            group.brandLogo = brandLogos[group.brandCode] || '';
            if (!group.brandLogo && group.showLogo) {
              try {
                const brandSnap = await getDocs(
                  query(
                    collection(db, 'brands'),
                    where('code', '==', group.brandCode),
                    limit(1)
                  )
                );
                const brandData = brandSnap.docs[0]?.data();
                group.brandLogo =
                  brandData?.logos?.[0] || brandData?.logoUrl || '';
              } catch (err) {
                console.error('Failed to load brand logo', err);
              }
            }

            const assetSnap = await getDocs(
              collection(db, 'adGroups', d.id, 'assets')
            );
            const summary = summarizeByRecipe(
              assetSnap.docs.map((adDoc) => adDoc.data())
            );

            group.totalAds = assetSnap.docs.length;

            group.thumbnail = group.thumbnail || summary.thumbnail;
            group.counts = {
              reviewed: summary.reviewed,
              approved: summary.approved,
              archived: summary.archived,
              edit: summary.edit,
              rejected: summary.rejected,
            };

            const needsSummary =
              !data.thumbnailUrl ||
              data.reviewedCount !== summary.reviewed ||
              data.approvedCount !== summary.approved ||
              data.archivedCount !== summary.archived ||
              data.editCount !== summary.edit ||
              data.rejectedCount !== summary.rejected;

            if (needsSummary) {
              try {
                const update = {
                  reviewedCount: summary.reviewed,
                  approvedCount: summary.approved,
                  archivedCount: summary.archived,
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
          setGroups(
            list.filter(
              (g) =>
                g.status !== 'archived' &&
                (g.status === 'ready' || g.visibility === 'public')
            )
          );
          setLoading(false);
        } catch (err) {
          console.error('Failed to fetch groups', err);
          setGroups([]);
          setLoading(false);
        }
      },
      (err) => {
        console.error('Failed to fetch groups', err);
        setGroups([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [brandCodes, user]);

  useEffect(() => {
    if (Object.keys(brandLogos).length === 0) return;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        brandLogo: brandLogos[g.brandCode] || g.brandLogo || '',
      }))
    );
  }, [brandLogos]);

  return (
    <div className="min-h-screen p-4">
      {hasNegativeCredits && (
        <div className="mb-4 rounded border border-red-200 bg-red-100 p-2 text-red-800">
          Your credit balance is negative. Please add more credits.
        </div>
      )}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search groups"
          className="border px-2 py-1 rounded flex-1"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="border px-2 py-1 rounded"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
        >
          <option value="">All months</option>
          {months.map((m) => {
            const label = new Date(
              Number(m.slice(0, 4)),
              Number(m.slice(-2)) - 1,
              1
            ).toLocaleString('default', { month: 'short', year: 'numeric' });
            return (
              <option key={m} value={m}>
                {label}
              </option>
            );
          })}
        </select>
      </div>
      {loading ? (
        <p>Loading groups...</p>
      ) : filteredGroups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
          {filteredGroups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
