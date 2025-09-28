import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase/config';
import summarizeByRecipe from './utils/summarizeByRecipe.js';
import summarizeAdUnits from './utils/summarizeAdUnits.js';

const useClientAdGroups = (user, brandCodes = []) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasNegativeCredits, setHasNegativeCredits] = useState(false);
  const [brandLogos, setBrandLogos] = useState({});

  useEffect(() => {
    if (brandCodes.length === 0) {
      setHasNegativeCredits(false);
      setBrandLogos({});
      return;
    }

    let cancelled = false;

    const checkCreditsAndLogos = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'brands'), where('code', 'in', brandCodes))
        );
        if (cancelled) return;

        const logos = {};
        const negative = snap.docs.some((d) => (d.data().credits ?? 0) < 0);
        snap.docs.forEach((d) => {
          const data = d.data();
          logos[data.code] = data.logos?.[0] || data.logoUrl || '';
        });

        setHasNegativeCredits(negative);
        setBrandLogos(logos);
      } catch (err) {
        console.error('Failed to check brand credits', err);
        if (!cancelled) {
          setHasNegativeCredits(false);
          setBrandLogos({});
        }
      }
    };

    checkCreditsAndLogos();

    return () => {
      cancelled = true;
    };
  }, [brandCodes]);

  useEffect(() => {
    if (!user?.uid || brandCodes.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(collection(db, 'adGroups'), where('brandCode', 'in', brandCodes));

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
                lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : null,
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
                    query(collection(db, 'brands'), where('code', '==', group.brandCode), limit(1))
                  );
                  const brandData = brandSnap.docs[0]?.data();
                  group.brandLogo = brandData?.logos?.[0] || brandData?.logoUrl || '';
                } catch (err) {
                  console.error('Failed to load brand logo', err);
                }
              }

              let unitSnap;
              try {
                unitSnap = await getDocs(collection(db, 'adGroups', d.id, 'adUnits'));
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
                  assetSnap = await getDocs(collection(db, 'adGroups', d.id, 'assets'));
                } catch (err) {
                  console.error('Failed to load group assets', err);
                  assetSnap = { docs: [] };
                }
                summary = summarizeByRecipe(assetSnap.docs.map((adDoc) => adDoc.data()));
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

          const filtered = list.filter(
            (g) =>
              g.status !== 'archived' &&
              (['designed', 'reviewed', 'done'].includes(g.status) || g.visibility === 'public')
          );

          setGroups(filtered);
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

  const months = useMemo(
    () => Array.from(new Set(groups.map((g) => g.month).filter(Boolean))).sort(),
    [groups]
  );

  return { groups, loading, hasNegativeCredits, months };
};

export default useClientAdGroups;
