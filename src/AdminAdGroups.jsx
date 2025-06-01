import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiEye,
  FiCheckCircle,
  FiTrash,
  FiClock,
  FiLink,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
  FiFileText,
  FiGrid,
  FiArchive,
  FiRotateCcw,
} from 'react-icons/fi';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import deleteGroup from './utils/deleteGroup';
import CreateAdGroup from './CreateAdGroup';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import parseAdFilename from './utils/parseAdFilename';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';

const AdminAdGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);

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
        const base = collection(db, 'adGroups');
        const q = showArchived ? base : query(base, where('status', 'not-in', ['archived']));
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
              counts: {
                approved: data.approvedCount || 0,
                rejected: data.rejectedCount || 0,
                edit: data.editCount || 0,
              },
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
  }, [showArchived]);

  const handleDeleteGroup = async (groupId, brandCode, groupName) => {
    if (!window.confirm('Delete this group?')) return;
    try {
      await deleteGroup(groupId, brandCode, groupName);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

  const handleArchiveGroup = async (groupId) => {
    if (!window.confirm('Archive this group?')) return;
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, status: 'archived' } : g))
      );
    } catch (err) {
      console.error('Failed to archive group', err);
    }
  };

  const handleRestoreGroup = async (groupId) => {
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        status: 'pending',
        archivedAt: null,
        archivedBy: null,
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, status: 'pending' } : g))
      );
    } catch (err) {
      console.error('Failed to restore group', err);
    }
  };

  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Admin Ad Groups</h1>

      <div className="mb-8">
        <h2 className="text-xl mb-2">All Ad Groups</h2>
        <label className="block mb-2 text-sm">
          <input
            type="checkbox"
            className="mr-1"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        {loading ? (
          <p>Loading groups...</p>
        ) : groups.length === 0 ? (
          <p>No ad groups found.</p>
        ) : (
          <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max text-[12px]">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Brand</th>
                <th className="text-center"><FiGrid aria-label="Recipes" /></th>
                <th>Status</th>
                <th className="text-center"><FiThumbsUp aria-label="Approved" /></th>
                <th className="text-center"><FiThumbsDown aria-label="Rejected" /></th>
                <th className="text-center"><FiEdit aria-label="Edit Requested" /></th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{g.brandCode}</td>
                  <td className="text-center">{g.recipeCount}</td>
                  <td className="text-center">
                    <span className={`status-badge status-${g.status}`}>{g.status}</span>
                  </td>
                  <td className="text-center text-approve">{g.counts.approved}</td>
                  <td className="text-center text-reject">{g.counts.rejected}</td>
                  <td className="text-center text-edit">{g.counts.edit}</td>
                  <td className="text-center">
                    {g.clientNote ? (
                      <button
                        onClick={() => setViewNote(g.clientNote)}
                        className="flex items-center text-gray-700 underline"
                        aria-label="View Client Note"
                      >
                        <FiFileText className="mr-1" />
                        View Note
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <Link
                        to={`/ad-group/${g.id}`}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1"
                        aria-label="View Details"
                      >
                        <FiEye />
                        <span className="text-[12px]">Details</span>
                      </Link>
                      <Link
                        to={`/review/${g.id}`}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2"
                        aria-label="Review"
                      >
                        <FiCheckCircle />
                        <span className="text-[12px]">Review</span>
                      </Link>
                      <button
                        onClick={() => handleShare(g.id)}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2"
                        aria-label="Share Link"
                      >
                        <FiLink />
                        <span className="text-[12px]">Share</span>
                      </button>
                      {g.status === 'archived' ? (
                        <button
                          onClick={() => handleRestoreGroup(g.id)}
                          className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2"
                          aria-label="Restore"
                        >
                          <FiRotateCcw />
                          <span className="text-[12px]">Restore</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArchiveGroup(g.id)}
                          className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2"
                          aria-label="Archive"
                        >
                          <FiArchive />
                          <span className="text-[12px]">Archive</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2 btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <h2 className="text-xl mb-2">Administration Tools</h2>
      <p className="mb-8 text-sm text-gray-600">Additional admin features will appear here.</p>

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

export default AdminAdGroups;
