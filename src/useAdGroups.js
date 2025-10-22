import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import parseAdFilename from './utils/parseAdFilename';
import getUserName from './utils/getUserName';
import aggregateRecipeStatusCounts from './utils/aggregateRecipeStatusCounts';

const useAdGroups = (brandCodes = [], showArchived = false) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroups = async () => {
      if (!brandCodes || brandCodes.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const base = collection(db, 'adGroups');
        const docs = [];
        for (let i = 0; i < brandCodes.length; i += 10) {
          const chunk = brandCodes.slice(i, i + 10);
          const snap = await getDocs(query(base, where('brandCode', 'in', chunk)));
          docs.push(
            ...(showArchived
              ? snap.docs
              : snap.docs.filter((d) => d.data()?.status !== 'archived'))
          );
        }
        const seen = new Set();
        const list = await Promise.all(
          docs
            .filter((d) => {
              if (seen.has(d.id)) return false;
              seen.add(d.id);
              return true;
            })
            .map(async (d) => {
              const data = d.data();
              let recipeCount = 0;
              let assetCount = 0;
              const recipeCodes = new Set();
              let assets = [];
              try {
                const assetSnap = await getDocs(collection(db, 'adGroups', d.id, 'assets'));
                assets = assetSnap.docs.map((adDoc) => {
                  const adData = adDoc.data();
                  const code =
                    adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
                  if (code) recipeCodes.add(code);
                  return { id: adDoc.id, ...adData };
                });
                assetCount = assets.length;
              } catch (err) {
                console.error('Failed to load assets', err);
              }

              let recipeIds = Array.from(recipeCodes);
              try {
                const recipeSnap = await getDocs(collection(db, 'adGroups', d.id, 'recipes'));
                if (recipeSnap.docs.length > 0) {
                  recipeIds = recipeSnap.docs.map((docSnap) => docSnap.id);
                }
                recipeCount =
                  recipeSnap.docs.length > 0 ? recipeSnap.docs.length : recipeCodes.size;
              } catch (err) {
                console.error('Failed to load recipes', err);
                recipeCount = recipeCodes.size;
              }

              const { unitCount, statusCounts } = aggregateRecipeStatusCounts(
                assets,
                recipeIds,
              );

              const designerName = data.designerId ? await getUserName(data.designerId) : '';
              const editorName = data.editorId ? await getUserName(data.editorId) : '';

              return {
                id: d.id,
                ...data,
                recipeCount: recipeCount || unitCount,
                assetCount,
                unitCount,
                pendingCount: statusCounts.pending,
                counts: {
                  approved: statusCounts.approved,
                  archived: statusCounts.archived,
                  rejected: statusCounts.rejected,
                  edit: statusCounts.edit_requested,
                },
                designerName,
                editorName,
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
  }, [brandCodes, showArchived]);

  return { groups, loading };
};

export default useAdGroups;
