import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import parseAdFilename from './utils/parseAdFilename';
import getUserName from './utils/getUserName';
import aggregateRecipeStatusCounts from './utils/aggregateRecipeStatusCounts';
import computeKanbanStatus from './utils/computeKanbanStatus';
import AdGroupCard from './components/AdGroupCard.jsx';
import PageToolbar from './components/PageToolbar.jsx';

const EditorAdGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const user = auth.currentUser;

  useEffect(() => {
    const fetchGroups = async () => {
      if (!user?.uid) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'adGroups'), where('editorId', '==', user.uid))
        );
        const docs = snap.docs.filter((d) => d.data()?.status !== 'archived');
        const list = await Promise.all(
          docs.map(async (d) => {
            const data = d.data();
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
            } catch (err) {
              console.error('Failed to load recipes', err);
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
              recipeCount: unitCount,
              assetCount,
              unitCount,
              readyCount: statusCounts.ready,
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
  }, [user?.uid]);

  const term = filter.toLowerCase();
  const displayGroups = groups.filter(
    (g) =>
      !term ||
      g.name?.toLowerCase().includes(term) ||
      g.brandCode?.toLowerCase().includes(term)
  );

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Ad Groups</h1>
      <div className="mb-8">
        <PageToolbar
          left={
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="p-1 border rounded"
            />
          }
        />
        {loading ? (
          <p>Loading groups...</p>
        ) : displayGroups.length === 0 ? (
          <p>No ad groups found.</p>
        ) : (
          <>
            <div className="sm:hidden space-y-4">
              {displayGroups.map((g) => (
                <AdGroupCard key={g.id} group={g} hideMenu />
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto mt-[0.8rem]">
              <div className="min-w-max flex gap-4">
                {[
                  { label: 'New', status: 'new' },
                  { label: 'Blocked', status: 'blocked' },
                  { label: 'Briefed', status: 'briefed' },
                  { label: 'Designed', status: 'designed' },
                  { label: 'Reviewed', status: 'reviewed' },
                  { label: 'Done', status: 'done' },
                ].map((col) => (
                  <div key={col.status} className="flex-shrink-0 w-[240px] sm:w-[320px]">
                    <h2 className="text-xl mb-2 capitalize">{col.label}</h2>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {displayGroups
                        .filter((g) => computeKanbanStatus(g) === col.status)
                        .map((g) => (
                          <AdGroupCard key={g.id} group={g} hideMenu />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditorAdGroups;

