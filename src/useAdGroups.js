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

              const assetsPromise = getDocs(collection(db, 'adGroups', d.id, 'assets')).catch(
                (err) => {
                  console.error('Failed to load assets', err);
                  return null;
                },
              );
              const recipesPromise = getDocs(collection(db, 'adGroups', d.id, 'recipes')).catch(
                (err) => {
                  console.error('Failed to load recipes', err);
                  return null;
                },
              );

              const [assetSnap, recipeSnap] = await Promise.all([assetsPromise, recipesPromise]);

              if (assetSnap) {
                assets = assetSnap.docs.map((adDoc) => {
                  const adData = adDoc.data();
                  const code =
                    adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
                  if (code) recipeCodes.add(code);
                  return { id: adDoc.id, ...adData };
                });
                assetCount = assets.length;
              }

              let recipeIds = Array.from(recipeCodes);
              if (recipeSnap) {
                if (recipeSnap.docs.length > 0) {
                  recipeIds = recipeSnap.docs.map((docSnap) => docSnap.id);
                }
                recipeCount =
                  recipeSnap.docs.length > 0 ? recipeSnap.docs.length : recipeCodes.size;
              } else {
                recipeCount = recipeCodes.size;
              }

              const { unitCount, statusCounts } = aggregateRecipeStatusCounts(
                assets,
                recipeIds,
              );

              const [designerName, editorName] = await Promise.all([
                data.designerId ? getUserName(data.designerId) : '',
                data.editorId ? getUserName(data.editorId) : '',
              ]);

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
