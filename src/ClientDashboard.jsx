import React, { useEffect, useState, useMemo } from 'react';
import ReviewGroupCard from './components/ReviewGroupCard.jsx';
import summarizeByRecipe from './utils/summarizeByRecipe.js';
import summarizeAdUnits from './utils/summarizeAdUnits.js';
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

            let unitSnap;
            try {
              unitSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'adUnits')
              );
            } catch (err) {
              console.error('Failed to load ad units', err);
              unitSnap = { docs: [] };
            }

            let summary;
            if (unitSnap.docs.length > 0) {
              const units = unitSnap.docs.map((u) => u.data());
              summary = summarizeAdUnits(units);
              group.totalAds = unitSnap.docs.length;
            } else {
              let assetSnap;
              try {
                assetSnap = await getDocs(
                  collection(db, 'adGroups', d.id, 'assets')
                );
              } catch (err) {
                console.error('Failed to load group assets', err);
                assetSnap = { docs: [] };
              }
              summary = summarizeByRecipe(
                assetSnap.docs.map((adDoc) => adDoc.data())
              );
              group.totalAds = assetSnap.docs.length;
            }

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
                  ...(data.thumbnailUrl
                    ? {}
                    : summary.thumbnail
                    ? { thumbnailUrl: summary.thumbnail }
                    : {}),
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
                (['designed', 'reviewed', 'done'].includes(g.status) ||
                  g.visibility === 'public')
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
            <ReviewGroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
