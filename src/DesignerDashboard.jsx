import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import deleteGroup from './utils/deleteGroup';
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
        let q;
        if (brandCodes && brandCodes.length > 0) {
          q = query(
            collection(db, 'adGroups'),
            where('brandCode', 'in', brandCodes)
          );
        } else {
          q = query(
            collection(db, 'adGroups'),
            where('uploadedBy', '==', auth.currentUser?.uid || ''),
            where('status', 'not-in', ['archived'])
          );
        }
        const snap = await getDocs(q);
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let recipeCount = data.recipeCount;
            if (recipeCount === undefined) {
              try {
                const recipesSnap = await getDocs(
                  collection(db, 'adGroups', d.id, 'recipes')
                );
                recipeCount = recipesSnap.size;
              } catch (err) {
                console.error('Failed to load recipes', err);
                recipeCount = 0;
              }
            }

            let assetCount = 0;
            let hasEdit = false;
            try {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              assetCount = assetSnap.size;
              hasEdit = assetSnap.docs.some((adDoc) => {
                const ad = adDoc.data();
                return ad.status === 'edit_requested' && !ad.isResolved;
              });
            } catch (err) {
              console.error('Failed to load assets', err);
            }

            return {
              id: d.id,
              ...data,
              recipeCount,
              assetCount,
              hasEdit,
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

  const handleDeleteGroup = async (groupId, brandCode, groupName) => {
    if (!window.confirm('Delete this group?')) return;
    try {
      await deleteGroup(groupId, brandCode, groupName);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {groups.map((g) => {
              const colorMap = {
                approve:
                  'bg-[var(--approve-color-10)] border-[var(--approve-color)] text-approve',
                edit:
                  'bg-[var(--edit-color-10)] border-[var(--edit-color)] text-edit',
                accent: 'bg-accent-10 border-accent text-accent',
                gray: 'bg-gray-300 border-gray-400 text-gray-600 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-200',
                reject:
                  'bg-[var(--reject-color-10)] border-[var(--reject-color)] text-reject',
              };
              const getClasses = () => {
                if (g.cardColor && colorMap[g.cardColor]) return colorMap[g.cardColor];
                if (g.recipeCount === 0) return colorMap.gray;
                if (g.hasEdit) return colorMap.edit;
                // swap accent and approved color logic
                if (g.assetCount === g.recipeCount) return colorMap.accent;
                if (g.assetCount === 0) return colorMap.approve;
                return colorMap.accent;
              };
              return (
                <Link key={g.id} to={`/ad-group/${g.id}`} className="flex flex-col items-center">
                  <div className={`w-32 h-32 border rounded-2xl flex items-center justify-center ${getClasses()}`}>
                    <span className="font-bold text-2xl">{g.recipeCount}</span>
                  </div>
                  <p className="mt-2 font-semibold text-center text-black dark:text-[var(--dark-text)] mb-0">{g.name}</p>
                  <p className="text-black dark:text-[var(--dark-text)] text-sm text-center">{g.brandCode}</p>
                  {g.dueDate && (
                    <p className="text-black dark:text-[var(--dark-text)] text-xs text-center">Due {g.dueDate.toDate().toLocaleDateString()}</p>
                  )}
                </Link>
              );
            })}
          </div>
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
