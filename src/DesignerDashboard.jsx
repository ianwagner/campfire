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
import CreateAdGroup from './CreateAdGroup';
import useUserRole from './useUserRole';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import parseAdFilename from './utils/parseAdFilename';

const DesignerDashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);

  const [shareInfo, setShareInfo] = useState(null);
  const [brandNames, setBrandNames] = useState({});

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
        const q = query(
          collection(db, 'adGroups'),
          where('uploadedBy', '==', auth.currentUser?.uid || ''),
          where('status', 'not-in', ['archived'])
        );
        const snap = await getDocs(q);
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let recipeCount = data.recipeCount;
            if (recipeCount === undefined) {
              try {
                const assetSnap = await getDocs(
                  collection(db, 'adGroups', d.id, 'assets')
                );
                const set = new Set();
                assetSnap.docs.forEach((adDoc) => {
                  const info = parseAdFilename(adDoc.data().filename || '');
                  if (info.recipeCode) set.add(info.recipeCode);
                });
                recipeCount = set.size;
              } catch (err) {
                console.error('Failed to load recipes', err);
                recipeCount = 0;
              }
            }
            return {
              id: d.id,
              ...data,
              recipeCount,
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
  }, []);

  useEffect(() => {
    const fetchNames = async () => {
      const missing = groups
        .map((g) => g.brandCode)
        .filter((c) => c && !brandNames[c]);
      for (const code of missing) {
        try {
          const snap = await getDocs(
            query(collection(db, 'brands'), where('code', '==', code))
          );
          const name = !snap.empty ? snap.docs[0].data().name || code : code;
          setBrandNames((prev) => ({ ...prev, [code]: name }));
        } catch (err) {
          console.error('Failed to fetch brand name', err);
          setBrandNames((prev) => ({ ...prev, [code]: code }));
        }
      }
    };
    if (groups.length > 0) fetchNames();
  }, [groups]);

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
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {groups.map((g) => (
              <div key={g.id} className="text-center">
                <Link to={`/ad-group/${g.id}`} className="block">
                  <div className="w-32 h-32 bg-accent-10 border border-accent rounded mx-auto flex items-center justify-center">
                    <span className="text-accent font-bold text-3xl">{g.recipeCount}</span>
                  </div>
                </Link>
                <p className="mt-2 font-medium">{g.name}</p>
                <p className="text-black">{brandNames[g.brandCode] || g.brandCode}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateAdGroup showSidebar={false} />
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
