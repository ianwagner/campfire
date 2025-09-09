import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import parseAdFilename from './utils/parseAdFilename';
import getUserName from './utils/getUserName';

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
              let readyCount = 0;
              let approvedCount = 0;
              let archivedCount = 0;
              let rejectedCount = 0;
              let editCount = 0;
              const set = new Set();
              try {
                const assetSnap = await getDocs(collection(db, 'adGroups', d.id, 'assets'));
                assetCount = assetSnap.docs.length;
                assetSnap.docs.forEach((adDoc) => {
                  const adData = adDoc.data();
                  if (adData.status === 'ready') readyCount += 1;
                  if (adData.status === 'approved') approvedCount += 1;
                  if (adData.status === 'archived') archivedCount += 1;
                  if (adData.status === 'rejected') rejectedCount += 1;
                  if (adData.status === 'edit_requested') editCount += 1;
                  const code =
                    adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
                  if (code) set.add(code);
                });
              } catch (err) {
                console.error('Failed to load assets', err);
              }
              try {
                const recipeSnap = await getDocs(collection(db, 'adGroups', d.id, 'recipes'));
                recipeCount =
                  recipeSnap.docs.length > 0 ? recipeSnap.docs.length : set.size;
              } catch (err) {
                console.error('Failed to load recipes', err);
                recipeCount = set.size;
              }

              const designerName = data.designerId ? await getUserName(data.designerId) : '';
              const editorName = data.editorId ? await getUserName(data.editorId) : '';

              return {
                id: d.id,
                ...data,
                recipeCount,
                assetCount,
                readyCount,
                counts: {
                  approved: approvedCount,
                  archived: archivedCount,
                  rejected: rejectedCount,
                  edit: editCount,
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
