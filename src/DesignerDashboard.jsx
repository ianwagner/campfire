import React, { useEffect, useState } from 'react';
import AdGroupCard from './components/AdGroupCard.jsx';
import parseAdFilename from './utils/parseAdFilename';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';

const DesignerDashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const user = auth.currentUser;
  const { role, brandCodes } = useUserRole(user?.uid);

  const [shareInfo, setShareInfo] = useState(null);

  const kanbanColumns = [
    { label: 'Pending', statuses: ['pending'] },
    { label: 'Briefed', statuses: ['briefed'] },
    { label: 'Designed', statuses: ['ready'] },
    { label: 'In Review/Review Pending', statuses: ['in review', 'review pending'] },
    { label: 'Reviewed', statuses: ['reviewed'] },
  ];

  const handleShare = async (id) => {
    let url = `${window.location.origin}/review/${id}`;
    const params = new URLSearchParams();
    if (user?.email) params.set('email', user.email);
    if (role) params.set('role', role);
    const str = params.toString();
    if (str) url += `?${str}`;

    const password = generatePassword();
    try {
      await updateDoc(doc(db, 'adGroups', id), { password });
    } catch (err) {
      console.error('Failed to set password', err);
    }
    setShareInfo({ url, password });
  };

  useEffect(() => {
    const fetchGroups = async () => {
      setLoading(true);
      try {
        const results = new Map();
        let q;
        if (role === 'designer') {
          q = query(
            collection(db, 'adGroups'),
            where('designerId', '==', auth.currentUser?.uid || ''),
            where('status', 'not-in', ['archived'])
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => results.set(d.id, d));
        } else if (brandCodes && brandCodes.length > 0) {
          q = query(collection(db, 'adGroups'), where('brandCode', 'in', brandCodes));
          const snap = await getDocs(q);
          snap.docs.forEach((d) => results.set(d.id, d));
        } else {
          q = query(
            collection(db, 'adGroups'),
            where('uploadedBy', '==', auth.currentUser?.uid || ''),
            where('status', 'not-in', ['archived'])
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => results.set(d.id, d));
        }

        const snapDocs = Array.from(results.values());
        const list = await Promise.all(
          snapDocs.map(async (d) => {
            const data = d.data();
            let recipeCount = data.recipeCount;
            let assetCount = 0;
            let readyCount = 0;
            const set = new Set();
            try {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              assetCount = assetSnap.docs.length;
              assetSnap.docs.forEach((adDoc) => {
                const adData = adDoc.data();
                if (adData.status === 'ready') readyCount += 1;
                if (recipeCount === undefined) {
                  const info = parseAdFilename(adData.filename || '');
                  if (info.recipeCode) set.add(info.recipeCode);
                }
              });
              if (recipeCount === undefined) recipeCount = set.size;
            } catch (err) {
              console.error('Failed to load assets', err);
              if (recipeCount === undefined) recipeCount = 0;
            }
            return {
              id: d.id,
              ...data,
              recipeCount,
              assetCount,
              readyCount,
              counts: {
                approved: data.approvedCount || 0,
                rejected: data.rejectedCount || 0,
                edit: data.editCount || 0,
              },
            };
          })
        );
        const filtered = list
          .filter((g) => g.status !== 'archived')
          .sort((a, b) => {
            const aDate = a.dueDate?.toDate ? a.dueDate.toDate() : null;
            const bDate = b.dueDate?.toDate ? b.dueDate.toDate() : null;
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return bDate - aDate;
          });
        setGroups(filtered);
      } catch (err) {
        console.error('Failed to fetch groups', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [brandCodes]);


  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Designer Dashboard</h1>

      <div className="mb-8">
        <h2 className="text-xl mb-2">My Ad Groups</h2>
        {loading ? (
          <p>Loading groups...</p>
        ) : groups.length === 0 ? (
          <p>No ad groups found.</p>
        ) : (
          <>
            <div className="sm:hidden space-y-4">
              {groups.map((g) => (
                <AdGroupCard key={g.id} group={g} />
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto mt-[0.8rem]">
              <div className="min-w-max flex gap-4">
                {kanbanColumns.map((col) => (
                  <div key={col.label} className="flex-shrink-0 w-[240px] sm:w-[320px]">
                    <h3 className="mb-2">{col.label}</h3>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {groups
                        .filter((g) => col.statuses.includes(g.status))
                        .map((g) => (
                          <AdGroupCard key={g.id} group={g} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {viewNote && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <p className="mb-4 whitespace-pre-wrap">{viewNote}</p>
            <button
              onClick={() => setViewNote(null)}
              className="btn-primary px-3 py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {shareInfo && (
        <ShareLinkModal
          url={shareInfo.url}
          password={shareInfo.password}
          onClose={() => setShareInfo(null)}
        />
      )}
    </div>
  );
};

export default DesignerDashboard;
